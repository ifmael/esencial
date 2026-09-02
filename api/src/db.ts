// D1 binding access (design D3). The only module that names the Env type.
export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
};

export function getDb(env: Env): D1Database {
  return env.DB;
}
