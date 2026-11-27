import { z } from "zod";
import catalog from "../data/ingredients.json";

export const ingredients = catalog.ingredients;
export const ingredientNames = new Map(ingredients.map(({ id, label }) => [id, label]));
export const ingredientId = z.string().regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
export const opaqueId = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);
export const pantrySchema = z.strictObject({
  schemaVersion: z.literal(1),
  confirmedIngredientIds: z.array(ingredientId),
  stapleIngredientIds: z.array(ingredientId),
  freeTextItems: z.array(z.strictObject({ id: opaqueId, label: z.string().trim().min(1).max(100) })),
});

export type Pantry = z.infer<typeof pantrySchema>;
export const emptyPantry: Pantry = {
  schemaVersion: 1,
  confirmedIngredientIds: [],
  stapleIngredientIds: [],
  freeTextItems: [],
};

export function normalizeName(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function findIngredients(query: string) {
  const search = normalizeName(query);
  if (!search) return [];
  return ingredients
    .map((ingredient) => {
      const names = [ingredient.label, ...ingredient.aliases].map(normalizeName);
      const rank = names.includes(search) ? 0 : names.some((name) => name.startsWith(search)) ? 1 : 2;
      return { ingredient, rank, matches: names.some((name) => name.includes(search)) };
    })
    .filter(({ matches }) => matches)
    .sort((a, b) => a.rank - b.rank || a.ingredient.label.localeCompare(b.ingredient.label, "en"))
    .map(({ ingredient }) => ingredient);
}

export function readPantry(value: string | null): Pantry {
  if (value === null) return emptyPantry;
  try {
    const parsed = pantrySchema.safeParse(JSON.parse(value));
    if (!parsed.success) return emptyPantry;
    const uniqueKnown = (ids: string[]) => [...new Set(ids)].filter((id) => ingredientNames.has(id));
    return {
      ...parsed.data,
      confirmedIngredientIds: uniqueKnown(parsed.data.confirmedIngredientIds),
      stapleIngredientIds: uniqueKnown(parsed.data.stapleIngredientIds),
      freeTextItems: [...new Map(parsed.data.freeTextItems.map((item) => [item.id, item])).values()],
    };
  } catch {
    return emptyPantry;
  }
}

export function availableIngredients(pantry: Pantry) {
  return new Set([...pantry.confirmedIngredientIds, ...pantry.stapleIngredientIds]);
}

export function addIngredient(pantry: Pantry, id: string): Pantry {
  if (!ingredientNames.has(id) || availableIngredients(pantry).has(id)) return pantry;
  return { ...pantry, confirmedIngredientIds: [...pantry.confirmedIngredientIds, id] };
}

export function removeIngredient(pantry: Pantry, id: string): Pantry {
  return {
    ...pantry,
    confirmedIngredientIds: pantry.confirmedIngredientIds.filter((item) => item !== id),
    stapleIngredientIds: pantry.stapleIngredientIds.filter((item) => item !== id),
  };
}

export function toggleStaple(pantry: Pantry, id: string): Pantry {
  if (pantry.stapleIngredientIds.includes(id)) {
    return {
      ...pantry,
      stapleIngredientIds: pantry.stapleIngredientIds.filter((item) => item !== id),
    };
  }
  return { ...pantry, stapleIngredientIds: [...pantry.stapleIngredientIds, id] };
}
