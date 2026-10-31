import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// `vite build` → dist/ (served by the Worker as SPA assets).
// `vite dev` proxies /api to wrangler dev (8787) for hot reload (task 3.1).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 8787}` },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    // Node ≥25 trae un `localStorage` propio (vacío, sin `clear`) que tapa el
    // de jsdom en los workers de test: se apaga para que mande el de jsdom.
    execArgv: ["--no-experimental-webstorage"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text-summary"],
      thresholds: { statements: 87, branches: 85, functions: 86, lines: 88 },
    },
  },
});
