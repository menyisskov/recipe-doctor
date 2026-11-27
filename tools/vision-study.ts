import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import sharp from "sharp";
import { ingredientNames } from "../lib/pantry";
import { localId, recognitionResponse } from "../lib/vision/contracts";
import { visionSettings } from "../lib/vision/settings";

const photo = z.strictObject({
  file: z.string().min(1),
  visibleIds: z.array(z.string().refine((id) => ingredientNames.has(id))),
});
const dataset = z.array(z.strictObject({
  kitchen: z.string().min(1),
  category: z.enum(["fridge", "pantry"]),
  split: z.enum(["development", "holdout"]),
  consentForProvider: z.boolean(),
  wide: photo,
  closeups: z.array(photo).min(1),
})).min(1);
type Photo = z.infer<typeof photo>;
type Stats = { timings: number[]; failed: number; correct: number; suggested: number; visible: number; combinedVisible: number };
class StudyInputError extends Error {}

function percentile(sorted: number[], fraction: number) {
  return sorted.length ? Math.round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]) : null;
}

async function run() {
  const [manifestPath, split] = process.argv.slice(2);
  const config = visionSettings();
  if (!manifestPath || (split !== "development" && split !== "holdout") || !config) {
    throw new StudyInputError("Provide a private manifest, development or holdout, and matching server environment settings.");
  }
  const endpoint = new URL("/api/recognize", process.env.STUDY_APP_URL);
  if (endpoint.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)) {
    throw new StudyInputError("Run the study against an explicitly configured loopback app.");
  }
  if (config.VISION_MODE === "responses" && process.env.STUDY_ALLOW_PROVIDER !== "true") {
    throw new StudyInputError("Real runs require STUDY_ALLOW_PROVIDER=true after consent and budget approval.");
  }
  const file = await realpath(manifestPath);
  const root = dirname(file);
  const parsed = dataset.safeParse(JSON.parse(await readFile(file, "utf8")));
  if (!parsed.success) throw new StudyInputError("The private manifest does not match the study format or references an unknown ingredient.");
  const kitchens = new Map<string, string>();
  for (const scene of parsed.data) {
    const previous = kitchens.get(scene.kitchen);
    if (previous && previous !== scene.split) throw new StudyInputError("A kitchen appears in both evaluation splits.");
    kitchens.set(scene.kitchen, scene.split);
  }
  const selected = parsed.data.filter((scene) => scene.split === split);
  if (!selected.length) throw new StudyInputError("No scenes are present in the requested split.");
  if (config.VISION_MODE === "responses" && selected.some((scene) => !scene.consentForProvider)) {
    throw new StudyInputError("The requested split contains scenes without consent for provider processing.");
  }
  const preflight = await fetch(endpoint, { signal: AbortSignal.timeout(config.VISION_TIMEOUT_MS) });
  if (!preflight.ok || (await preflight.json()).mode !== config.VISION_MODE) {
    throw new StudyInputError("The target app mode differs from the local study configuration.");
  }

  const { VISION_MAX_IMAGE_PIXELS: pixelLimit, VISION_CLIENT_MAX_EDGE: edge } = config;
  async function jpeg(input: Photo) {
    const source = await realpath(resolve(root, input.file));
    const fromRoot = relative(root, source);
    if (isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
      throw new StudyInputError("A photo resolves outside the private manifest directory.");
    }
    return sharp(source, { limitInputPixels: pixelLimit }).rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer();
  }
  const stats = new Map<string, Stats>();
  for (const scene of selected) {
    const combined = [scene.wide, ...scene.closeups];
    if (combined.length > config.VISION_MAX_IMAGES) throw new StudyInputError("A scene has more images than the configured scan limit.");
    const combinedTruth = new Set(combined.flatMap(({ visibleIds }) => visibleIds));
    const buffers = await Promise.all(combined.map(jpeg));
    for (const mode of ["wide", "wideAndCloseups"] as const) {
      const images = mode === "wide" ? buffers.slice(0, 1) : buffers;
      const truth = mode === "wide" ? new Set(scene.wide.visibleIds) : combinedTruth;
      const key = `${scene.category}.${mode}`;
      const values = stats.get(key) ?? { timings: [], failed: 0, correct: 0, suggested: 0, visible: 0, combinedVisible: 0 };
      stats.set(key, values);
      const requestId = localId();
      const imageIds = images.map(localId);
      const form = new FormData();
      form.set("manifest", JSON.stringify({ schemaVersion: 1, requestId, imageIds }));
      for (const [index, image] of images.entries()) {
        form.set(`image_${imageIds[index]}`, new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "photo.jpg");
      }
      const start = performance.now();
      try {
        const response = await fetch(endpoint, { method: "POST", body: form,
          signal: AbortSignal.timeout(config.VISION_UPLOAD_TIMEOUT_MS + config.VISION_ATTEMPTS * config.VISION_TIMEOUT_MS) });
        const output = recognitionResponse.safeParse(await response.json());
        if (!response.ok || !output.success || output.data.status !== "success" || output.data.requestId !== requestId) {
          values.failed++;
          continue;
        }
        const suggestions = new Set(output.data.suggestions.flatMap((item) => item.kind === "catalog" ? [item.ingredientId] : []));
        values.correct += [...suggestions].filter((id) => truth.has(id)).length;
        values.suggested += suggestions.size;
        values.visible += truth.size;
        values.combinedVisible += combinedTruth.size;
      } catch {
        values.failed++;
      } finally {
        values.timings.push(performance.now() - start);
      }
    }
  }
  const ratio = (total: number, count: number) => count > 0 ? total / count : null;
  const results = Object.fromEntries([...stats].map(([key, value]) => {
    const sorted = value.timings.toSorted((a, b) => a - b);
    return [key, {
      runs: sorted.length, failures: value.failed, medianMs: percentile(sorted, .5), p90Ms: percentile(sorted, .9),
      correct: value.correct, suggested: value.suggested, visible: value.visible, combinedVisible: value.combinedVisible,
      precisionOnSuccessfulScans: ratio(value.correct, value.suggested),
      missedVisibleOnSuccessfulScans: ratio(value.visible - value.correct, value.visible),
      combinedSceneCoverageOnSuccessfulScans: ratio(value.correct, value.combinedVisible),
    }];
  }));
  console.log(JSON.stringify({ mode: config.VISION_MODE, split, scenes: selected.length, results }, null, 2));
}

run().catch((error: unknown) => {
  // Avoid filesystem paths, provider payloads, or participant IDs in error output.
  const message = error instanceof StudyInputError ? error.message : "Check the private input format, file access, and local app connectivity.";
  console.error(message);
  process.exitCode = 1;
});
