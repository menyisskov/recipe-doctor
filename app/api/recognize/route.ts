import sharp from "sharp";
import { manifest, type ErrorCode } from "../../../lib/vision/contracts";
import { providerFor, ProviderUnavailable, type Usage } from "../../../lib/vision/provider";
import { InvalidProviderOutput, recognize } from "../../../lib/vision/recognize";
import { visionSettings, type VisionSettings } from "../../../lib/vision/settings";

export const runtime = "nodejs";

class RequestError extends Error {
  constructor(readonly code: ErrorCode, readonly status: number, readonly retryable = false) {
    super(code);
  }
}

const limits = { startedAt: 0, accepted: 0, active: 0 };
function takeSlot(config: VisionSettings) {
  const now = Date.now();
  if (now - limits.startedAt >= config.VISION_WINDOW_MS) {
    limits.startedAt = now;
    limits.accepted = 0;
  }
  if (limits.accepted >= config.VISION_REQUESTS_PER_WINDOW || limits.active >= config.VISION_MAX_CONCURRENT) {
    throw new RequestError("rate_limited", 429, true);
  }
  limits.accepted++;
  limits.active++;
}

async function cappedForm(request: Request, config: VisionSettings) {
  const type = request.headers.get("content-type");
  if (!type?.toLowerCase().startsWith("multipart/form-data;") || !request.body) {
    throw new RequestError("invalid_request", 400);
  }
  const max = config.VISION_MAX_REQUEST_BYTES;
  if (Number(request.headers.get("content-length")) > max) throw new RequestError("upload_limit", 413);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  const timer = AbortSignal.timeout(config.VISION_UPLOAD_TIMEOUT_MS);
  const signal = AbortSignal.any([request.signal, timer]);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    let size = 0;
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        cancel();
        throw new RequestError("upload_limit", 413);
      }
      chunks.push(value);
    }
    if (signal.aborted) throw new RequestError("timeout", 504, true);
    return await new Response(Buffer.concat(chunks), { headers: { "content-type": type } }).formData();
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("invalid_request", 400);
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

async function sanitizeImage(file: File, config: VisionSettings): Promise<Buffer> {
  if (file.size > config.VISION_MAX_IMAGE_BYTES) throw new RequestError("upload_limit", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const jpeg = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const expected = jpeg ? "jpeg" : png ? "png" : webp ? "webp" : null;
  if (!expected || file.type !== `image/${expected}`) throw new RequestError("unsupported_image", 415);
  try {
    const image = sharp(bytes, { limitInputPixels: config.VISION_MAX_IMAGE_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== expected || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
    return await image.rotate().resize({ width: config.VISION_CLIENT_MAX_EDGE, height: config.VISION_CLIENT_MAX_EDGE,
      fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg().toBuffer();
  } catch {
    throw new RequestError("unsupported_image", 415);
  }
}

function json(payload: object, status = 200) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export function GET() {
  return json({ mode: visionSettings()?.VISION_MODE ?? "disabled" });
}

export async function POST(request: Request) {
  const config = visionSettings();
  const started = performance.now();
  let requestId: string | null = null;
  let occupied = false;
  let attempts = 0;
  let usage: Usage | undefined;
  let status: string = "success";
  try {
    if (!config) throw new RequestError("provider_unavailable", 503);
    const origin = request.headers.get("origin");
    const requestUrl = new URL(request.url);
    const host = request.headers.get("host") ?? requestUrl.host;
    const expectedOrigin = config.VISION_MODE === "responses" ? config.VISION_PUBLIC_ORIGIN : `${requestUrl.protocol}//${host}`;
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== expectedOrigin)) {
      throw new RequestError("invalid_request", 403);
    }
    takeSlot(config);
    occupied = true;
    const form = await cappedForm(request, config);
    const raw = form.get("manifest");
    const result = (() => {
      if (typeof raw !== "string") return null;
      try { return manifest.safeParse(JSON.parse(raw)); } catch { return null; }
    })();
    if (!result?.success) throw new RequestError("invalid_request", 400);
    const { imageIds } = result.data;
    requestId = result.data.requestId;
    if (imageIds.length > config.VISION_MAX_IMAGES) throw new RequestError("upload_limit", 413);
    if (Array.from(form.keys()).length !== imageIds.length + 1) throw new RequestError("invalid_request", 400);
    const images = [];
    for (const id of imageIds) {
      const upload = form.getAll(`image_${id}`);
      if (upload.length !== 1 || !(upload[0] instanceof File)) throw new RequestError("invalid_request", 400);
      images.push({ id, bytes: await sanitizeImage(upload[0], config) });
    }
    const provider = providerFor(config);
    for (let attempt = 1; attempt <= config.VISION_ATTEMPTS; attempt++) {
      attempts = attempt;
      const timeout = AbortSignal.timeout(config.VISION_TIMEOUT_MS);
      const signal = AbortSignal.any([timeout, request.signal]);
      try {
        const result = await recognize(provider, images, signal);
        usage = result.usage;
        return json({ schemaVersion: 1, requestId, status: "success", suggestions: result.suggestions });
      } catch (error) {
        if (error instanceof InvalidProviderOutput) {
          usage = error.usage;
          throw new RequestError("invalid_provider_output", 502, true);
        }
        if (request.signal.aborted) throw new RequestError("timeout", 504);
        const retryable = timeout.aborted || (error instanceof ProviderUnavailable && error.retryable);
        if (!retryable || attempt === config.VISION_ATTEMPTS) {
          if (timeout.aborted) throw new RequestError("timeout", 504, true);
          throw new RequestError("provider_unavailable", 503, retryable);
        }
      }
    }
    throw new RequestError("provider_unavailable", 503);
  } catch (error) {
    const failure = error instanceof RequestError ? error : new RequestError("provider_unavailable", 503, true);
    status = failure.code;
    return json({ schemaVersion: 1, requestId, status: "error", code: failure.code, retryable: failure.retryable }, failure.status);
  } finally {
    if (occupied) limits.active--;
    if (attempts) {
      const costUsd = config?.VISION_MODE === "responses" && usage &&
        config.VISION_INPUT_USD_PER_MILLION !== undefined && config.VISION_OUTPUT_USD_PER_MILLION !== undefined
        ? (usage.inputTokens * config.VISION_INPUT_USD_PER_MILLION + usage.outputTokens * config.VISION_OUTPUT_USD_PER_MILLION) / 1_000_000 : undefined;
      console.info(JSON.stringify({ event: "vision", status, attempts, durationMs: Math.round(performance.now() - started), usage, costUsd }));
    }
  }
}
