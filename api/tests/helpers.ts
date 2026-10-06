// Shared test helpers: real local D1 (miniflare via vitest-pool-workers) +
// fetch-style request builders against the Hono app. Parity with E1 helpers.
// Multi-usuario: get/post/put/del/postForm llevan la identidad de dev (cabecera
// X-Dev-Email con el admin) y anon* van sin identidad para fijar el 401 del
// gate. E8: multipart upload builders for POST /api/uploads (body must stay
// FormData: no explicit content-type, so fetch sets the boundary).
import { env } from "cloudflare:test";
import migrations0002 from "../migrations/0002_e2_recipes_photo_tags.sql?raw";
import m0003Sql from "../migrations/0003_e3_shopping.sql?raw";
import m0005Sql from "../migrations/0005_exercise_steps.sql?raw";
import m0016Sql from "../migrations/0016_alimentos.sql?raw";
import m0018Sql from "../migrations/0018_descansos.sql?raw";
import m0019Sql from "../migrations/0019_users.sql?raw";
import m0024Sql from "../migrations/0024_supersets.sql?raw";
import schemaSql from "../schema.sql?raw";
import app from "../src/index";

/** Identidad de dev de los helpers autenticados; es el ADMIN_EMAIL del Worker
 *  de test (wrangler.test.toml) para que el primer usuario sea el admin. */
const ADMIN = "admin@esencial.test";

let bootstrapped = false;

/** Apply api/schema.sql + each 0002+ migration once per worker instance,
 *  reproducing the wrangler-runner end state inside the vitest pool.
 *  (0002's ALTER is not re-runnable; the bootstrap flag is our once-only.) */
async function bootstrap(): Promise<void> {
  if (bootstrapped) return;
  // batch() runs a multi-statement query when unbound: schema applies atomically.
  await env.DB.batch([
    env.DB.prepare(schemaSql),
    env.DB.prepare(migrations0002),
  ]);
  // Reproduce the wrangler runner's end state: each additive migration file
  // in filename order. E2 0002 + E3 0003 mirror _cf_D1_MIGRATIONS (once per worker).
  for (const sql of [
    m0003Sql,
    m0005Sql,
    m0016Sql,
    m0018Sql,
    m0019Sql,
    m0024Sql,
  ])
    await env.DB.batch(
      sql
        .split(";")
        .filter((s) => s.trim())
        .map((s) => env.DB.prepare(s)),
    );
  bootstrapped = true;
}

// Child-before-parent order keeps FK checks happy if enforcement is on.
const TABLES = [
  "uploads",
  "users",
  "families",
  "shopping_items",
  "cardio_logs",
  "set_logs",
  "workout_logs",
  "plan_session_exercises",
  "plan_sessions",
  "meal_slots",
  "week_plans",
  "template_exercises",
  "session_templates",
  "exercise_regions",
  "exercise_tags",
  "exercise_aliases",
  "exercises",
  "recipe_ingredients",
  "foods",
  "recipe_steps",
  "recipe_materials",
  "recipe_tags",
  "recipes",
  "day_notes",
];

/** Fresh tables per test file (files run sequentially in one worker). Los
 *  borrados van en un batch con la comprobación de FK diferida: las tablas se
 *  referencian entre sí (users ← plan_sessions), así que en orden de hijos a
 *  padres salta el constraint a media lista. */
export async function freshDb(): Promise<void> {
  await bootstrap();
  await env.DB.batch([
    env.DB.prepare("PRAGMA defer_foreign_keys = true"),
    ...TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  ]);
}

/** Rehace el esquema desde cero: lo usan los tests que tocan la DDL (los de
 *  migraciones, que recrean tablas). Los ficheros comparten la D1 del worker,
 *  así que hay que dejarla como estaba. */
export async function resetSchema(): Promise<void> {
  // Las tablas se referencian entre sí (users ← plan_sessions), así que soltarlas
  // en orden de hijos a padres no basta: se difiere la comprobación de FK hasta
  // el final, cuando ya no queda ninguna tabla a la que apuntar.
  await env.DB.batch([
    env.DB.prepare("PRAGMA defer_foreign_keys = true"),
    ...TABLES.map((t) => env.DB.prepare(`DROP TABLE IF EXISTS ${t}`)),
  ]);
  bootstrapped = false;
  await bootstrap();
}

/** Direct D1 helpers for seeding/assertions (mirrors legacy getDb usage). */
export const d1 = {
  async run(sql: string, ...args: unknown[]): Promise<number> {
    const { meta } = await env.DB.prepare(sql)
      .bind(...(args as never[]))
      .run();
    return Number(meta.last_row_id);
  },
  async get<T = Record<string, unknown>>(
    sql: string,
    ...args: unknown[]
  ): Promise<T | null> {
    return await env.DB.prepare(sql)
      .bind(...(args as never[]))
      .first<T>();
  },
  async all<T = Record<string, unknown>>(
    sql: string,
    ...args: unknown[]
  ): Promise<T[]> {
    const { results } = await env.DB.prepare(sql)
      .bind(...(args as never[]))
      .all<T>();
    return results ?? [];
  },
};

function url(path: string): string {
  return `http://localhost${path}`;
}

/** Request WITHOUT identity (gate contract). */
export async function anonGet(path: string): Promise<Response> {
  return await app.request(url(path), {}, env);
}
export async function anonSend(
  path: string,
  method: string,
  body: unknown,
): Promise<Response> {
  return await app.request(
    url(path),
    {
      method,
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    env,
  );
}

export async function get(path: string): Promise<Response> {
  return await app.request(
    url(path),
    { headers: { "X-Dev-Email": ADMIN } },
    env,
  );
}

export async function send(
  path: string,
  method: string,
  body: unknown,
): Promise<Response> {
  return await app.request(
    url(path),
    {
      method,
      headers: { "content-type": "application/json", "X-Dev-Email": ADMIN },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    env,
  );
}

/** E8: multipart POST con una identidad dev concreta (para probar el
 *  aislamiento de las fotos: la subida es de quien la hace). */
export async function devPostForm(
  path: string,
  form: FormData,
  email: string,
): Promise<Response> {
  return await app.request(
    url(path),
    { method: "POST", body: form, headers: { "X-Dev-Email": email } },
    env,
  );
}

/** Petición con una identidad de dev concreta: la cabecera X-Dev-Email solo se
 *  honra con DEV_AUTH=1 (lo fijan el bootstrap de tests y el e2e), que es lo
 *  que permite varios usuarios en la misma corrida (aislamiento, familia).
 *  `bindings` deja al test apagar el seam para fijar el fail-closed. */
export async function devGet(
  path: string,
  email: string,
  bindings: typeof env = env,
): Promise<Response> {
  return await app.request(
    url(path),
    { headers: { "X-Dev-Email": email } },
    bindings,
  );
}

export async function devSend(
  path: string,
  method: string,
  body: unknown,
  email: string,
  bindings: typeof env = env,
): Promise<Response> {
  return await app.request(
    url(path),
    {
      method,
      headers: { "content-type": "application/json", "X-Dev-Email": email },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    bindings,
  );
}

export const post = (path: string, body: unknown) => send(path, "POST", body);
export const put = (path: string, body: unknown) => send(path, "PUT", body);
export async function del(path: string): Promise<Response> {
  return await app.request(
    url(path),
    { method: "DELETE", headers: { "X-Dev-Email": ADMIN } },
    env,
  );
}

/** E8: multipart POST with the admin identity; body stays FormData so fetch
 *  generates the multipart boundary. */
export async function postForm(
  path: string,
  form: FormData,
): Promise<Response> {
  return await app.request(
    url(path),
    { method: "POST", body: form, headers: { "X-Dev-Email": ADMIN } },
    env,
  );
}
/** E8: multipart POST WITHOUT identity (gate contract). */
export async function anonPostForm(
  path: string,
  form: FormData,
): Promise<Response> {
  return await app.request(url(path), { method: "POST", body: form }, env);
}
