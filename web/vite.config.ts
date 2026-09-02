import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
  },
});
