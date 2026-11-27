import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "android-chromium", use: { ...devices["Pixel 7"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 14"] } },
  ],
});
