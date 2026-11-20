import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// End-to-end smoke tests (e2e/*.e2e.ts) against the Vite dev server in a plain browser: the app's
// browser fallbacks (bridge.ts) + `window.__nexis` dev hooks + `nexis:*` events stand in for the
// Tauri backend, and every external request is answered from e2e/fixtures (see e2e/support.ts).

const PORT = 4319;
// Sandboxes with a preinstalled Chromium (no browser download); CI runs `npx playwright install chromium`.
const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1180, height: 760 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
    launchOptions: !process.env.CI && existsSync(LOCAL_CHROMIUM) ? { executablePath: LOCAL_CHROMIUM } : {},
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
