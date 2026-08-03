import { defineConfig } from "@playwright/test";

const PORT = process.env.E2E_PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  // Generous: the first hit on a route in `next dev` compiles it on demand.
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: process.env.PW_TRACE === "1" ? "retain-on-failure" : "off",
    // Escape hatch for sandboxes that ship a Chromium build Playwright didn't
    // download itself: PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ["--no-sandbox"] }
      : undefined,
  },
  // Assumes `npm run dev` (or `docker compose up`) is already serving the app.
  // Set E2E_MANAGED_SERVER=1 to let Playwright boot it instead.
  webServer: process.env.E2E_MANAGED_SERVER
    ? {
        command: "npm run dev",
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
});
