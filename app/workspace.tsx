"use client";

import Link from "next/link";
import { useState } from "react";
import { addIngredient, availableIngredients, emptyPantry, ingredientNames, normalizeName, removeIngredient, toggleStaple } from "../lib/pantry";
import { matchRecipes, recipeCatalog } from "../lib/recipes";
import { localId } from "../lib/vision/contracts";
import type { PublicVisionSettings } from "../lib/vision/settings";
import IngredientPicker from "./ingredient-picker";
import PhotoScan from "./photo-scan";
import { usePantry } from "./use-pantry";

const stapleOptions = ["salt", "oil", "olive_oil", "black_pepper", "water"];

export default function Workspace({ vision }: { vision: PublicVisionSettings | null }) {
  const { pantry, setPantry, ready, storageFailed } = usePantry();
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const available = availableIngredients(pantry);
  const matches = matchRecipes(recipeCatalog, available);
  function approve(ids: string[]) {
    setPantry((current) => ids.reduce(addIngredient, current));
  }
  function retain(label: string) {
    const id = localId();
    setPantry((current) => normalizeName(label) && !current.freeTextItems.some((item) => normalizeName(item.label) === normalizeName(label))
      ? { ...current, freeTextItems: [...current.freeTextItems, { id, label }] } : current);
  }
  function changeUnlinked(id: string, linkedId?: string) {
    setPantry((current) => ({
      ...(linkedId ? addIngredient(current, linkedId) : current),
      freeTextItems: current.freeTextItems.filter((item) => item.id !== id),
    }));
    setLinkingId(null);
  }
  return (
    <main className="shell workspace" id="main" tabIndex={-1}>
      <section className="intro">
        <h1>Make the most of what you have.</h1>
        <p>Snap a photo or add ingredients by hand to find recipes you can make today.</p>
      </section>
      <div className="workspace-grid">
        <div className="column">
          <PhotoScan key={resetVersion} vision={vision} available={available} approve={approve} retain={retain} />
          <section className="panel pantry" aria-labelledby="pantry-title">
            <div className="section-heading">
              <h2 id="pantry-title">Your ingredients</h2>
              {available.size + pantry.freeTextItems.length > 0 && (
                <button className="quiet" type="button" onClick={() => setResetting(!resetting)}>Reset list</button>
              )}
            </div>
            {resetting && (
              <div className="notice">
                <p>Clear your ingredients, saved staples, and current scan?</p>
                <button className="secondary" type="button" onClick={() => {
                  setPantry(emptyPantry); setLinkingId(null); setResetting(false); setResetVersion((version) => version + 1);
                }}>Clear list</button>
                <button className="quiet" type="button" onClick={() => setResetting(false)}>Cancel</button>
              </div>
            )}
            <fieldset disabled={!ready}>
              <legend className="visually-hidden">Edit your ingredients</legend>
              <IngredientPicker inputId="ingredient-search" onSelect={(id) => approve([id])} onFreeText={retain} />
              {available.size > 0 && (
                <ul className="chips" aria-label="Confirmed ingredients">
                  {[...available].map((id) => (
                    <li key={id}>
                      <button className="chip" type="button" aria-label={`Remove ${ingredientNames.get(id)}`}
                        onClick={() => setPantry((current) => removeIngredient(current, id))}>
                        {ingredientNames.get(id)} <span aria-hidden="true">×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {pantry.freeTextItems.length > 0 && (
                <div className="unlinked">
                  <h3>Unlinked items</h3>
                  <p className="muted">Link these to a catalog ingredient to use them in recipe matches.</p>
                  <ul className="list">
                    {pantry.freeTextItems.map(({ id, label }) => (
                      <li key={id} className="unlinked-item">
                        <div className="row">
                          <span>{label}</span>
                          <button className="quiet" type="button" onClick={() => setLinkingId(linkingId === id ? null : id)}>Link<span className="visually-hidden"> {label}</span></button>
                          <button className="quiet" type="button" onClick={() => changeUnlinked(id)}>Remove<span className="visually-hidden"> {label}</span></button>
                        </div>
                        {linkingId === id && <IngredientPicker inputId={`link-${id}`} initialValue={label} onSelect={(linkedId) => changeUnlinked(id, linkedId)} />}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <details className="staples">
                <summary>Kitchen staples</summary>
                <p className="muted">Choose staples you have on hand. Your selections are remembered on this device.</p>
                <div className="staple-options">
                  {stapleOptions.map((id) => (
                    <label key={id}>
                      <input type="checkbox" checked={pantry.stapleIngredientIds.includes(id)}
                        onChange={() => setPantry((current) => toggleStaple(current, id))} />
                      {ingredientNames.get(id)}
                    </label>
                  ))}
                </div>
              </details>
            </fieldset>
            {storageFailed && <p className="muted" role="status">Your browser could not save the list. You can keep editing it on this page.</p>}
          </section>
        </div>
        <section className="column recipe-column" aria-labelledby="results-title">
          <div className="results-heading">
            <h2 id="results-title">What you can cook</h2>
            <p className="muted" role="status">{matches.length === 1 ? "1 matching recipe" : `${matches.length} matching recipes`}</p>
          </div>
          {matches.length === 0 ? (
            <div className="empty">
              <h3>{available.size === 0 ? "Start with what's on hand" : "No recipes match yet"}</h3>
              <p>{available.size === 0 ? "Confirm ingredients to see recipes you can make." : "The catalog has no recipe you can make with the ingredients confirmed so far. Add or review ingredients and try again."}</p>
              <a className="secondary" href="#ingredient-search">Edit ingredients</a>
            </div>
          ) : (
            <ul className="recipe-list">
              {matches.map(({ recipe, substitutions }) => (
                <li className="recipe-card" key={recipe.id}>
                  <h3><Link href={`/recipes/${recipe.id}`}>{recipe.title}</Link></h3>
                  <p>{recipe.description}</p>
                  <p className="recipe-meta"><span>{recipe.preparationMinutes} min</span><span>{recipe.servings} {recipe.servings === 1 ? "serving" : "servings"}</span></p>
                  {substitutions.size > 0 && <p className="substitution">Uses {Array.from(substitutions.values(), ({ ingredientId }) => ingredientNames.get(ingredientId)).join(", ")} as a substitute.</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
