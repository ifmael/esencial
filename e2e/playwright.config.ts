import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const BRAVE = "/usr/bin/brave-browser";
const BASE = "http://127.0.0.1:8787";

export default defineConfig({
  testDir: "./tests",
  retries: 2,
  use: {
    baseURL: BASE,
    launchOptions: {
      // Brave en local; en CI, el chromium que instala Playwright.
      executablePath: existsSync(BRAVE) ? BRAVE : undefined,
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "pnpm dev",
    cwd: "..",
    url: `${BASE}/api/health`,
    timeout: 120_000,
    reuseExistingServer: true,
  },
  projects: [
    { name: "setup", testMatch: /setup\.ts/, use: devices["Desktop Chrome"] },
    {
      name: "authed",
      testIgnore: /setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/state.json",
      },
      dependencies: ["setup"],
    },
  ],
});
