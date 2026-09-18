import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const BRAVE = "/usr/bin/brave-browser";
// Puerto propio de e2e: con 8787 + reuseExistingServer, un `pnpm dev` en marcha
// sería adoptado y la suite escribiría en la base de desarrollo.
const BASE = "http://127.0.0.1:8788";

// La base de e2e se DERIVA de api/migrations/ en cada corrida y vive en
// e2e/.state: nunca se lee ni se escribe .wrangler/state. Añadir una migración
// no requiere tocar nada de aquí. `< /dev/null` evita el prompt (Y/n) de wrangler
// cuando corre en TTY (AGENTS.md, problema conocido 2).
const SERVER =
  "ESENCIAL_DEV_PASSWORD=hola pnpm predev && " +
  "rm -rf e2e/.state && " +
  "npx wrangler d1 migrations apply esencial --local --persist-to e2e/.state < /dev/null && " +
  "pnpm build && " +
  "npx wrangler dev --persist-to e2e/.state --port 8788";

export default defineConfig({
  testDir: "./tests",
  retries: 2,
  // Un servidor y una base por corrida: en paralelo los archivos comparten
  // estado (p. ej. auth-dia afirma que hoy está vacío y recipes planifica la
  // semana actual, que es hoy cuando la corrida cae en lunes).
  workers: 1,
  use: {
    baseURL: BASE,
    launchOptions: {
      // Brave en local; en CI, el chromium que instala Playwright.
      executablePath: existsSync(BRAVE) ? BRAVE : undefined,
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: SERVER,
    cwd: "..",
    url: `${BASE}/api/health`,
    // rm + migraciones + build: más lento que `pnpm dev` a secas.
    timeout: 180_000,
    reuseExistingServer: false,
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
