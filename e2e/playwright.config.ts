import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const BRAVE = "/usr/bin/brave-browser";
// Puerto propio de e2e: con 8787 + reuseExistingServer, un `pnpm dev` en marcha
// sería adoptado y la suite escribiría en la base de desarrollo.
// Los dos puertos se pueden cambiar por entorno (E2E_WEB_PORT / E2E_API_PORT)
// para correr la suite en paralelo con otros worktrees; por defecto, los de
// siempre.
const WEB_PORT = process.env.E2E_WEB_PORT ?? "8788";
const API_PORT = process.env.E2E_API_PORT ?? "8790";
const BASE = `http://127.0.0.1:${WEB_PORT}`;
// B' (dos despliegues): la API es su propio Worker, en su propio puerto. El SPA
// se construye apuntando ahí (VITE_API_URL) y el frontal autoriza ese origen en
// su CSP (API_ORIGIN): los dos valores tienen que ser el mismo.
// helpers.ts deriva la misma URL de E2E_API_PORT (los workers heredan el entorno).
const API = `http://127.0.0.1:${API_PORT}`;

// La base de e2e se DERIVA de api/migrations/ en cada corrida y vive en
// e2e/.state: nunca se lee ni se escribe .wrangler/state. Añadir una migración
// no requiere tocar nada de aquí. `< /dev/null` evita el prompt (Y/n) de wrangler
// cuando corre en TTY (AGENTS.md, problema conocido 2).
const API_SERVER =
  "rm -rf e2e/.state && " +
  "npx wrangler d1 migrations apply esencial --local -c api/wrangler.toml --persist-to e2e/.state < /dev/null && " +
  // --var WEB_ORIGIN: el [vars] de api/wrangler.toml es el origen de producción;
  // en e2e el navegador viene de http://127.0.0.1:8788 y sin esto la API no le
  // daría permiso CORS.
  // --var DEV_AUTH + ADMIN_EMAIL (multi-usuario): aquí no hay Access delante, así
  // que TODAS las peticiones llevan la cabecera X-Dev-Email (el
  // `use.extraHTTPHeaders` de abajo, con la cuenta admin) y DEV_AUTH=1 hace que
  // el Worker la honre; ADMIN_EMAIL designa admin a esa cuenta. Los specs que
  // actúan como otro usuario abren su propio contexto con su X-Dev-Email.
  `npx wrangler dev -c api/wrangler.toml --port ${API_PORT} --var WEB_ORIGIN:${BASE} --var DEV_AUTH:1 --var ADMIN_EMAIL:admin@esencial.test --persist-to e2e/.state`;

// El Worker del frontal no toca D1: se le da su propio estado local para que el
// `rm -rf e2e/.state` del arranque de la API no le pise la caché a mitad de
// arranque. `--var API_ORIGIN` sustituye el valor de producción del wrangler.toml.
const WEB_SERVER =
  `VITE_API_URL=${API} pnpm build && ` +
  `npx wrangler dev --port ${WEB_PORT} --var API_ORIGIN:${API} --persist-to e2e/.state-web`;

export default defineConfig({
  testDir: "./tests",
  retries: 2,
  // Un servidor y una base por corrida: en paralelo los archivos comparten
  // estado (p. ej. recipes planifica la semana actual, que es hoy cuando la
  // corrida cae en lunes).
  workers: 1,
  use: {
    baseURL: BASE,
    // La identidad de dev va en TODAS las peticiones del navegador y del
    // contexto `request` (admin@esencial.test): la API la honra con DEV_AUTH=1,
    // así que no hay sesión propia que guardar ni proyecto `setup` que la cree.
    extraHTTPHeaders: { "X-Dev-Email": "admin@esencial.test" },
    launchOptions: {
      // Brave en local; en CI, el chromium que instala Playwright.
      executablePath: existsSync(BRAVE) ? BRAVE : undefined,
      // Headless, Chromium pinta WebGL con SwiftShader (por software) y la app
      // enseña el mapa SVG: los tests del visor 3D se saltarían. En macOS,
      // Metal da la GPU de verdad también en headless; el CI (Linux sin GPU)
      // los salta.
      args: [
        "--no-sandbox",
        ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
      ],
    },
  },
  webServer: [
    {
      command: API_SERVER,
      cwd: "..",
      url: `${API}/api/health`,
      // rm + migraciones: más lento que `pnpm dev` a secas.
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: WEB_SERVER,
      cwd: "..",
      url: `${BASE}/`,
      // tsc + vite build antes de arrancar.
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
  projects: [{ name: "app", use: devices["Desktop Chrome"] }],
});
