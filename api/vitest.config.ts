// vitest-pool-workers 0.22 API: cloudflareTest is a Vite plugin carrying the
// pool options (see codemods/vitest-v3-to-v4 in the package).

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./tests/wrangler.test.toml" },
    }),
  ],
  test: {
    // Files share one miniflare D1 namespace: run them one at a time and wipe
    // tables per file (see tests/helpers.ts).
    fileParallelism: false,
  },
});
