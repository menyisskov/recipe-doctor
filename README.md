# What's in the Fridge?

Find recipes you can make with the ingredients you already have. Add ingredients by hand or add photos, review the suggestions, and see complete recipe matches immediately.

## Run locally

Use Node.js 20.9 or later.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Manual mode requires no credentials or environment settings. The pantry and saved staples are stored on this device. Reset the list from the pantry panel.

## Enable scanning

Copy `.env.example` to the ignored `.env.local`. Set `VISION_MODE=mock` and the common settings below to test the upload and review flow with simulated suggestions. In mock mode, the app server receives the photos and calls no external provider.

Choose values appropriate to your machine and deployment. For example, for a local test you can use 3 images, an image limit of 1,500,000 bytes, a request limit of 5,000,000 bytes, a 1,600-pixel edge, and 4,000,000 decoded pixels. Upload and provider timeouts are in milliseconds. The rate limiter counts requests per process over the configured window and caps concurrent requests. A multi-instance public deployment needs a shared ingress limit and a host-level body limit.

To try the candidate provider, select `VISION_MODE=responses` and set its HTTPS Responses endpoint, the app's public HTTPS origin, model, API key, and output token limit. Put the API key in server-only configuration. Set the notice to reflect the chosen provider's verified retention settings and tell participants who will process the photos. Provide configured token rates to log estimated per-call dollar costs. Actual invoices are needed to account for any unreported usage on failed attempts. Approve spending and obtain consent before running real scans. See [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) and [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

For another provider, implement the `VisionProvider` interface in [provider.ts](lib/vision/provider.ts) and add a settings branch. Keep its response translation inside the adapter. The API route and normalization use the same canonical types regardless of provider.

The app does not persist images or clues. The provider receives a resized JPEG with metadata removed. The app rejects unsupported formats it cannot decode and offers the manual route. Operational vision logs contain duration, status, attempts, and available usage estimates. Keep infrastructure body logging disabled.

## Add content and run checks

Edit [ingredients](data/ingredients.json) to add a stable ID, English label, and aliases. Reuse existing IDs when adding recipes in [recipes.json](data/recipes.json). Include amounts and units, optional items, equipment, and instructions. Add substitutes only after checking the recipe with that substitute. Include all ingredients mentioned in the directions, including cooking water when used.

```sh
npm test
npm run check
npm run build
```

To run the browser checks, start the app in mock mode with at least two images per scan, point `PLAYWRIGHT_TEST_BASE_URL` at its origin, install Chromium and WebKit with `npx playwright install chromium webkit`, and run `npm run test:browser`. These profiles emulate mobile browsers for interaction tests. The pilot checklist still includes physical devices and native camera behavior.

See the [product specification](docs/milestone-1.md), [study plan](docs/vision-study.md), [pilot handoff](docs/pilot.md), and [contribution rules](AGENTS.md).
