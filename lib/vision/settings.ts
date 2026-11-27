import { z } from "zod";

const positive = z.coerce.number().int().positive();
const common = {
  VISION_MAX_IMAGES: positive,
  VISION_MAX_IMAGE_BYTES: positive,
  VISION_CLIENT_MAX_EDGE: positive,
  VISION_MAX_IMAGE_PIXELS: positive,
  VISION_MAX_REQUEST_BYTES: positive,
  VISION_UPLOAD_TIMEOUT_MS: positive,
  VISION_TIMEOUT_MS: positive,
  VISION_ATTEMPTS: z.coerce.number().int().min(1).max(3),
  VISION_WINDOW_MS: positive,
  VISION_REQUESTS_PER_WINDOW: positive,
  VISION_MAX_CONCURRENT: positive,
};
const settings = z.discriminatedUnion("VISION_MODE", [
  z.object({ VISION_MODE: z.literal("mock"), ...common }),
  z.object({
    VISION_MODE: z.literal("responses"), ...common,
    VISION_ENDPOINT: z.url({ protocol: /^https$/ }),
    VISION_PUBLIC_ORIGIN: z.url({ protocol: /^https$/ }).transform((value) => new URL(value).origin),
    VISION_MODEL: z.string().trim().min(1),
    VISION_API_KEY: z.string().trim().min(1),
    VISION_PRIVACY_NOTICE: z.string().trim().min(1).max(500),
    VISION_MAX_OUTPUT_TOKENS: positive,
    VISION_INPUT_USD_PER_MILLION: z.coerce.number<string>().finite().nonnegative().optional(),
    VISION_OUTPUT_USD_PER_MILLION: z.coerce.number<string>().finite().nonnegative().optional(),
  }),
]);
export type VisionSettings = z.infer<typeof settings>;
export type PublicVisionSettings = { maxImages: number; maxImageBytes: number; maxEdge: number; notice: string; mock: boolean };

export function visionSettings(): VisionSettings | null {
  const defined = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key.startsWith("VISION_") && value?.trim()));
  const parsed = settings.safeParse(defined);
  return parsed.success && parsed.data.VISION_MAX_IMAGE_BYTES < parsed.data.VISION_MAX_REQUEST_BYTES ? parsed.data : null;
}

export function publicVisionSettings(config: VisionSettings | null): PublicVisionSettings | null {
  if (!config) return null;
  return {
    maxImages: config.VISION_MAX_IMAGES,
    maxImageBytes: config.VISION_MAX_IMAGE_BYTES,
    maxEdge: config.VISION_CLIENT_MAX_EDGE,
    mock: config.VISION_MODE === "mock",
    notice: config.VISION_MODE === "mock"
      ? "Photos go to this app's server for the demo. Suggestions are simulated, and no photos are sent to a vision provider."
      : config.VISION_PRIVACY_NOTICE,
  };
}
