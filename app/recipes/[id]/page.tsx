import Link from "next/link";
import { notFound } from "next/navigation";
import { recipeCatalog } from "../../../lib/recipes";
import RecipeIngredients from "./recipe-ingredients";

export function generateStaticParams() {
  return recipeCatalog.map(({ id }) => ({ id }));
}

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = recipeCatalog.find((item) => item.id === id);
  if (!recipe) notFound();
  return (
    <main className="shell recipe-page" id="main" tabIndex={-1}>
      <Link className="back-link" href="/">Back to your ingredients</Link>
      <section className="intro recipe-intro">
        <h1>{recipe.title}</h1>
        <p>{recipe.description}</p>
        <p className="recipe-meta"><span>{recipe.preparationMinutes} min</span><span>{recipe.servings} {recipe.servings === 1 ? "serving" : "servings"}</span></p>
      </section>
      <div className="workspace-grid">
        <RecipeIngredients recipe={recipe} />
        <section className="panel">
          <h2>How to make it</h2>
          <ol className="steps">{recipe.steps.map(({ instruction }, index) => <li key={index}>{instruction}</li>)}</ol>
          {recipe.equipment.length > 0 && <><h3>Equipment</h3><ul>{recipe.equipment.map((item) => <li key={item}>{item}</li>)}</ul></>}
        </section>
      </div>
    </main>
  );
}
