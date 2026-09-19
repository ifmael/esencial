// D1 binding access (design D3). The only module that names the Env type.
export type Env = {
  DB: D1Database;
  PHOTOS: R2Bucket;
  // E7 secrets (wrangler secret put / .dev.vars); optional so a missing one
  // fails requests closed (500/401) instead of type-breaking local dev.
  AUTH_SECRET?: string;
  PASSWORD_HASH?: string;
  // B' (dos despliegues): orígenes de la web autorizados para CORS (CSV).
  // Sin valor, la API no autoriza a nadie (fail closed).
  WEB_ORIGIN?: string;
};

export function getDb(env: Env): D1Database {
  return env.DB;
}
