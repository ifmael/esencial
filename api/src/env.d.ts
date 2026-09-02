// Bindings for this Worker (mirrors wrangler.toml); `wrangler types` can
// regenerate this file at deploy time. Global script file: no imports here.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    AUTH_SECRET?: string;
    PASSWORD_HASH?: string;
  }
}

