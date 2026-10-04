// Bindings for this Worker (mirrors wrangler.toml); `wrangler types` can
// regenerate this file at deploy time. Global script file: no imports here.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    DEV_AUTH?: string;
    ADMIN_EMAIL?: string;
  }
}
