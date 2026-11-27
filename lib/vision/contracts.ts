import { z } from "zod";
import { ingredientId, opaqueId } from "../pantry";

const clue = z.string().trim().min(1).max(160);
const suggestedName = z.string().trim().min(1).max(100);
const evidence = z.strictObject({ imageId: opaqueId, clue });
const observation = { imageId: opaqueId, clue, uncertain: z.boolean() };
export const visionObservation = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("catalog"), ingredientId, ...observation }),
  z.strictObject({ kind: z.literal("free_text"), suggestedName, ...observation }),
]);
export const observations = z.strictObject({ schemaVersion: z.literal(1), observations: z.array(visionObservation) });
export const manifest = z.strictObject({
  schemaVersion: z.literal(1),
  requestId: opaqueId,
  imageIds: z.array(opaqueId).min(1).refine((value) => new Set(value).size === value.length),
});
export const suggestion = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("catalog"), ingredientId, uncertain: z.boolean(), evidence: z.array(evidence).min(1) }),
  z.strictObject({ kind: z.literal("free_text"), suggestedName, evidence: z.array(evidence).min(1) }),
]);
export const errorCode = z.enum([
  "invalid_request", "unsupported_image", "upload_limit", "rate_limited", "timeout",
  "provider_unavailable", "invalid_provider_output",
]);
export const recognitionResponse = z.discriminatedUnion("status", [
  z.strictObject({ schemaVersion: z.literal(1), requestId: opaqueId, status: z.literal("success"), suggestions: z.array(suggestion) }),
  z.strictObject({ schemaVersion: z.literal(1), requestId: opaqueId.nullable(), status: z.literal("error"), code: errorCode, retryable: z.boolean() }),
]);
export type Observation = z.infer<typeof visionObservation>;
export type Suggestion = z.infer<typeof suggestion>;
export type ErrorCode = z.infer<typeof errorCode>;

export function localId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
}
