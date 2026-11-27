import { z } from "zod";
import { ingredientNames, normalizeName } from "../pantry";
import type { VisionProvider, Usage } from "./provider";
import { observations, visionObservation, type Observation, type Suggestion } from "./contracts";

export class InvalidProviderOutput extends Error {
  constructor(readonly usage?: Usage) {
    super("Invalid provider output");
  }
}

export function mergeObservations(values: Observation[]): Suggestion[] {
  const merged = new Map<string, Suggestion>();
  for (const value of values) {
    const key = value.kind === "catalog" ? value.ingredientId : `free:${normalizeName(value.suggestedName)}`;
    const evidence = { imageId: value.imageId, clue: value.clue };
    const previous = merged.get(key);
    if (previous) {
      if (!previous.evidence.some((item) => item.imageId === evidence.imageId && item.clue === evidence.clue)) {
        previous.evidence.push(evidence);
      }
      if (previous.kind === "catalog" && value.kind === "catalog") previous.uncertain &&= value.uncertain;
      continue;
    }
    const suggestion: Suggestion = value.kind === "catalog"
      ? { kind: value.kind, ingredientId: value.ingredientId, uncertain: value.uncertain, evidence: [evidence] }
      : { kind: value.kind, suggestedName: value.suggestedName, evidence: [evidence] };
    merged.set(key, suggestion);
  }
  return [...merged.values()];
}

const envelope = observations.extend({ observations: z.array(z.unknown()) });
export async function recognize(provider: VisionProvider, images: Parameters<VisionProvider>[0], signal: AbortSignal) {
  const result = await provider(images, signal);
  const parsed = envelope.safeParse(result.output);
  if (!parsed.success) throw new InvalidProviderOutput(result.usage);
  const imageIds = new Set(images.map(({ id }) => id));
  const values = parsed.data.observations.flatMap((item) => {
    const observation = visionObservation.safeParse(item);
    if (!observation.success || !imageIds.has(observation.data.imageId)) return [];
    const value = observation.data;
    const known = value.kind === "catalog" ? ingredientNames.has(value.ingredientId) : Boolean(normalizeName(value.suggestedName));
    return known ? [value] : [];
  });
  if (parsed.data.observations.length && !values.length) throw new InvalidProviderOutput(result.usage);
  return { suggestions: mergeObservations(values), usage: result.usage };
}
