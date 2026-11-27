"use client";

import { ingredientNames, availableIngredients } from "../../../lib/pantry";
import type { Measure, Recipe } from "../../../lib/recipes";
import { usePantry } from "../../use-pantry";

function quantity({ amount, unit }: Measure) {
  if (unit === "piece") return String(amount);
  if (unit === "clove" || unit === "pinch") return `${amount} ${unit}${amount > 1 ? unit === "pinch" ? "es" : "s" : ""}`;
  return `${amount} ${unit}`;
}

export default function RecipeIngredients({ recipe }: { recipe: Recipe }) {
  const { pantry } = usePantry();
  const available = availableIngredients(pantry);
  return (
    <section className="panel">
      <h2>Ingredients</h2>
      <p className="muted">Check that you have enough of each ingredient before you start.</p>
      <ul className="measures">
        {recipe.requiredIngredients.map((item) => {
          const replacement = available.has(item.ingredientId) ? undefined :
            item.substitutions.find(({ ingredientId }) => available.has(ingredientId));
          const displayed = replacement ?? item;
          return (
            <li key={item.ingredientId}>
              <div className="row measure"><span>{ingredientNames.get(displayed.ingredientId)}</span><span>{quantity(displayed)}</span></div>
              {replacement && <p className="substitution">In place of {ingredientNames.get(item.ingredientId)}. {replacement.usageNote}</p>}
              {!replacement && item.substitutions.map((option) => (
                <p key={option.ingredientId} className="muted">Alternative: {quantity(option)} {ingredientNames.get(option.ingredientId)}. {option.usageNote}</p>
              ))}
            </li>
          );
        })}
      </ul>
      {recipe.optionalIngredients.length > 0 && <>
        <h3>Optional</h3>
        <ul className="measures">{recipe.optionalIngredients.map((item) =>
          <li className="row measure" key={item.ingredientId}><span>{ingredientNames.get(item.ingredientId)}</span><span>{quantity(item)}</span></li>)}</ul>
      </>}
    </section>
  );
}
