import recipes from "../data/recipes.json";

export type Measure = { ingredientId: string; amount: number; unit: string };
export type Substitution = Measure & { usageNote: string };
export type Recipe = {
  schemaVersion: number;
  id: string;
  title: string;
  description: string;
  preparationMinutes: number;
  servings: number;
  requiredIngredients: (Measure & { substitutions: Substitution[] })[];
  optionalIngredients: Measure[];
  equipment: string[];
  steps: { instruction: string; ingredientIds: string[] }[];
};
export type RecipeMatch = { recipe: Recipe; substitutions: Map<string, Substitution> };
export const recipeCatalog: Recipe[] = recipes;

export function matchRecipes(catalog: Recipe[], available: ReadonlySet<string>): RecipeMatch[] {
  const matches: RecipeMatch[] = [];
  for (const recipe of catalog) {
    const substitutions = new Map<string, Substitution>();
    const matched = recipe.requiredIngredients.every(({ ingredientId, substitutions: options }) => {
      if (available.has(ingredientId)) return true;
      const selected = options.find((option) => available.has(option.ingredientId));
      if (!selected) return false;
      substitutions.set(ingredientId, selected);
      return true;
    });
    if (matched) matches.push({ recipe, substitutions });
  }
  return matches.sort(({ recipe: a }, { recipe: b }) =>
    a.preparationMinutes - b.preparationMinutes || (a.id < b.id ? -1 : Number(a.id !== b.id)),
  );
}
