import { strict as assert } from "node:assert";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020";
import catalog from "../data/ingredients.json";
import catalogSchema from "../schemas/ingredient-catalog.schema.json";
import recipeSchema from "../schemas/recipe.schema.json";
import resultSchema from "../schemas/recognition-response.schema.json";
import { addIngredient, availableIngredients, emptyPantry, findIngredients, ingredientNames, normalizeName, readPantry, removeIngredient, toggleStaple } from "../lib/pantry";
import { matchRecipes, recipeCatalog } from "../lib/recipes";
import { InvalidProviderOutput, recognize } from "../lib/vision/recognize";
import { providerFor } from "../lib/vision/provider";
import type { VisionSettings } from "../lib/vision/settings";

const ajv = new Ajv2020();
const ids = new Set(catalog.ingredients.map(({ id }) => id));

test("public data conforms to schema and ingredient references are consistent", () => {
  const validateCatalog = ajv.compile(catalogSchema);
  const validateRecipe = ajv.compile(recipeSchema);
  assert.ok(validateCatalog(catalog), JSON.stringify(validateCatalog.errors));
  assert.equal(ids.size, catalog.ingredients.length);
  const names = catalog.ingredients.flatMap(({ label, aliases }) => [label, ...aliases].map(normalizeName));
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(recipeCatalog.map(({ id }) => id)).size, recipeCatalog.length);
  for (const recipe of recipeCatalog) {
    assert.ok(validateRecipe(recipe), JSON.stringify(validateRecipe.errors));
    const measures = [...recipe.requiredIngredients, ...recipe.optionalIngredients];
    const listed = new Set(measures.map(({ ingredientId }) => ingredientId));
    assert.equal(listed.size, measures.length);
    for (const ingredient of listed) assert.ok(ingredientNames.has(ingredient));
    for (const step of recipe.steps) for (const ingredient of step.ingredientIds) assert.ok(listed.has(ingredient));
    for (const required of recipe.requiredIngredients) {
      assert.equal(new Set(required.substitutions.map(({ ingredientId }) => ingredientId)).size, required.substitutions.length);
      for (const option of required.substitutions) {
        assert.ok(ingredientNames.has(option.ingredientId));
        assert.notEqual(option.ingredientId, required.ingredientId);
      }
    }
  }
});

test("matching requires all ingredients, handles recipe-specific substitutes and sorts deterministically", () => {
  const base = ["egg", "salt", "oil"];
  assert.deepEqual(matchRecipes(recipeCatalog, new Set(base)), []);
  assert.deepEqual(matchRecipes(recipeCatalog, new Set(["egg", "oil", "crushed_tomatoes"])), []);
  const [matched] = matchRecipes(recipeCatalog, new Set([...base, "egg", "crushed_tomatoes"]));
  assert.equal(matched.recipe.id, "tomato_eggs");
  assert.equal(matched.substitutions.get("tomato")?.ingredientId, "crushed_tomatoes");
  const [original] = matchRecipes(recipeCatalog, new Set([...base, "tomato", "crushed_tomatoes"]));
  assert.equal(original.substitutions.size, 0);
  const ordered = matchRecipes(recipeCatalog, ids).map(({ recipe }) => [recipe.preparationMinutes, recipe.id] as const);
  assert.deepEqual(ordered, [...ordered].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], "en")));
});

test("manual search and saved pantry keep approvals separate from unknown items", () => {
  assert.equal(findIngredients("bell PEPPER")[0].id, "sweet_pepper");
  assert.equal(findIngredients("tomatoes")[0].id, "tomato");
  assert.equal(findIngredients("crushed tomatoes")[0].id, "crushed_tomatoes");
  const pantry = readPantry(JSON.stringify({
    ...emptyPantry, confirmedIngredientIds: ["egg", "egg", "unknown"],
    freeTextItems: [{ id: "free", label: "Salt" }],
  }));
  assert.deepEqual([...availableIngredients(pantry)], ["egg"]);
  assert.equal(addIngredient(pantry, "unknown"), pantry);
  const withStaple = toggleStaple(pantry, "salt");
  assert.deepEqual([...availableIngredients(withStaple)], ["egg", "salt"]);
  assert.deepEqual([...availableIngredients(toggleStaple(withStaple, "salt"))], ["egg"]);
  assert.deepEqual([...availableIngredients(removeIngredient(withStaple, "salt"))], ["egg"]);
  assert.equal(readPantry("broken json"), emptyPantry);
});

test("normalization keeps provenance, drops invalid IDs and distinguishes uncertain suggestions", async () => {
  const signal = new AbortController().signal;
  const images = ["a", "b"].map((id) => ({ id, bytes: Buffer.alloc(0) }));
  const item = { kind: "catalog", imageId: "a", ingredientId: "egg", uncertain: true, clue: "Shell" };
  const values = [item, item, { ...item, imageId: "b", uncertain: false },
    { ...item, ingredientId: "made_up" }, { ...item, imageId: "unknown" },
    { kind: "free_text", imageId: "a", suggestedName: "Unknown jar", uncertain: false, clue: "Jar" },
  ];
  const provider = async () => ({ output: { schemaVersion: 1, observations: values } });
  const output = await recognize(provider, images, signal);
  assert.equal(output.suggestions.length, 2);
  assert.deepEqual(output.suggestions[0], {
    kind: "catalog", ingredientId: "egg", uncertain: false,
    evidence: [{ imageId: "a", clue: "Shell" }, { imageId: "b", clue: "Shell" }],
  });
  assert.equal(output.suggestions.at(-1)?.kind, "free_text");
  assert.ok(ajv.validate(resultSchema, {
    schemaVersion: 1, status: "success", requestId: "test", suggestions: output.suggestions,
  }));
  await assert.rejects(recognize(async () => ({ output: { schemaVersion: 1, observations: [{ ...item, imageId: "unknown" }] } }), images, signal), InvalidProviderOutput);
  assert.deepEqual((await recognize(async () => ({ output: { schemaVersion: 1, observations: [] } }), images, signal)).suggestions, []);
});

test("candidate adapter translates the provider response and disables response storage", async (context) => {
  const config: VisionSettings = {
    VISION_MODE: "responses", VISION_ENDPOINT: "https://example.test/responses", VISION_PUBLIC_ORIGIN: "https://app.example.test",
    VISION_MODEL: "fixture", VISION_API_KEY: "test-value", VISION_PRIVACY_NOTICE: "Test notice",
    VISION_MAX_OUTPUT_TOKENS: 300, VISION_MAX_IMAGES: 3, VISION_MAX_IMAGE_BYTES: 10000,
    VISION_MAX_IMAGE_PIXELS: 100000, VISION_MAX_REQUEST_BYTES: 50000, VISION_CLIENT_MAX_EDGE: 300,
    VISION_TIMEOUT_MS: 2000, VISION_UPLOAD_TIMEOUT_MS: 2000, VISION_ATTEMPTS: 1,
    VISION_WINDOW_MS: 1000, VISION_REQUESTS_PER_WINDOW: 2, VISION_MAX_CONCURRENT: 1,
  };
  const fixture = {
    observations: [{ imageId: "img", ingredientId: "egg", suggestedName: null, uncertain: true, clue: "Visible shell" }],
  };
  const request = context.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    const payload = JSON.parse(String(options.body));
    assert.equal(payload.store, false);
    assert.equal(payload.model, "fixture");
    assert.equal(payload.input[0].content[1].type, "input_image");
    assert.equal(payload.text.format.strict, true);
    return Response.json({
      status: "completed", usage: { input_tokens: 10, output_tokens: 6 },
      output: [{ content: [{ type: "output_text", text: JSON.stringify(fixture) }] }],
    });
  });
  const result = await recognize(providerFor(config), [{ id: "img", bytes: Buffer.from([0xff, 0xd8, 0xff]) }],
    new AbortController().signal);
  assert.equal(request.mock.callCount(), 1);
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 6 });
  assert.deepEqual(result.suggestions, [{
    kind: "catalog", ingredientId: "egg", uncertain: true, evidence: [{ imageId: "img", clue: "Visible shell" }],
  }]);
});
