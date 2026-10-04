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
  // Multi-usuario: seam de identidad solo-dev (`X-Dev-Email` se honra con
  // DEV_AUTH="1"; en producción la identidad la prueba Access) y el email que
  // se designa admin. Ninguno de los dos va en el wrangler de producción.
  DEV_AUTH?: string;
  ADMIN_EMAIL?: string;
};

export function getDb(env: Env): D1Database {
  return env.DB;
}

/** Una cuenta de `users`. El email llega ya normalizado (identity.ts). */
export type User = {
  id: number;
  email: string;
  role: "admin" | "member";
  family_id: number;
};

/** Contexto de las rutas: además de los bindings llevan el usuario de la
 *  petición, que pone el gate (`identifyUser`). */
export type AppContext = {
  Bindings: Env;
  Variables: { user: User };
};
