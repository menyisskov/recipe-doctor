import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";

async function add(page: Page, query: string, name: string) {
  await page.getByRole("searchbox", { name: "Find an ingredient" }).fill(query);
  await page.getByRole("button", { name, exact: true }).click();
}

test("manual pantry restores, finds a complete recipe and resets", async ({ page }) => {
  await page.goto("/");
  await add(page, "eggs", "Egg");
  await add(page, "crushed", "Crushed tomatoes");
  await page.getByText("Kitchen staples", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Neutral cooking oil" }).check();
  await expect(page.getByRole("heading", { name: "No recipes match yet" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Salt", exact: true }).check();
  await page.getByRole("link", { name: "Skillet tomato eggs" }).click();
  await expect(page.getByRole("heading", { name: "How to make it" })).toBeVisible();
  await expect(page.getByText("In place of Fresh tomato.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Back to your ingredients" }).click();
  await expect(page.getByRole("heading", { name: "Your ingredients" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Egg" })).toBeVisible();
  await page.getByRole("button", { name: "Reset list" }).click();
  await page.getByRole("button", { name: "Clear list" }).click();
  await expect(page.getByRole("heading", { name: "Start with what's on hand" })).toBeVisible();
});

test("mock scan requires consent and explicit uncertain approval, while retry preserves pantry", async ({ page }) => {
  await page.goto("/");
  await add(page, "eggs", "Egg");
  const jpeg = await sharp({ create: { width: 120, height: 96, channels: 3, background: "#67966a" } }).jpeg().toBuffer();
  await page.getByLabel("Upload photos").setInputFiles([
    { name: "wide.jpg", mimeType: "image/jpeg", buffer: jpeg },
    { name: "detail.jpg", mimeType: "image/jpeg", buffer: jpeg },
  ]);
  await expect(page.getByRole("img", { name: "Selected photo 2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan photos" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await page.route("**/api/recognize", async (route) => {
    await route.fulfill({ status: 503, json: { schemaVersion: 1, status: "error", code: "provider_unavailable", retryable: true, requestId: null } });
  }, { times: 1 });
  await page.getByRole("button", { name: "Scan photos" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Photo scanning is unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Egg" })).toBeVisible();
  await page.getByRole("button", { name: "Try scan again" }).click();
  await expect(page.getByText("Photo 2: Simulated cucumber detection")).toBeVisible();
  await page.getByRole("button", { name: "Confirm 1 clear suggestion" }).click();
  await expect(page.getByRole("button", { name: "Remove Cucumber" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Fresh tomato" })).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm Fresh tomato" }).click();
  await expect(page.getByRole("button", { name: "Remove Fresh tomato" })).toBeVisible();
  await page.getByRole("button", { name: "Keep unlinked Unmarked jar" }).click();
  await expect(page.getByRole("heading", { name: "Unlinked items" })).toBeVisible();
});

test("server rejects an upload whose bytes are not an image", async ({ request }) => {
  const response = await request.post("/api/recognize", {
    multipart: {
      manifest: JSON.stringify({ schemaVersion: 1, requestId: "test", imageIds: ["image"] }),
      image_image: { name: "bad.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fake image") },
    },
  });
  expect(response.status()).toBe(415);
  expect(await response.json()).toMatchObject({ code: "unsupported_image", requestId: "test", retryable: false });
});

test("keyboard search and linking a free-text item update the confirmed pantry", async ({ page }) => {
  await page.goto("/");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await skip.focus();
  await expect(skip).toBeVisible();
  await skip.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  const ingredient = page.getByRole("searchbox", { name: "Find an ingredient" });
  await ingredient.fill("Eggs");
  await ingredient.press("Enter");
  await expect(page.getByRole("button", { name: "Remove Egg" })).toBeVisible();
  await ingredient.fill("Ingredient from my shelf");
  await page.getByRole("button", { name: /Keep.*as an unlinked item/ }).click();
  await page.getByRole("button", { name: "Link Ingredient from my shelf" }).click();
  const linker = page.locator(".unlinked").getByRole("searchbox", { name: "Find an ingredient" });
  await linker.fill("Salt");
  await linker.press("Enter");
  await expect(page.getByRole("button", { name: "Remove Salt" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unlinked items" })).toHaveCount(0);
});
