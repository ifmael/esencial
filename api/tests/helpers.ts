// Shared test helpers: real local D1 (miniflare via vitest-pool-workers) +
// fetch-style request builders against the Hono app. Parity with E1 helpers.
// E7: get/post/put/del carry a session cookie obtained once per worker via a
// real /api/auth/login; anon* builders exercise the 401 gate. E8: multipart
// upload builders for POST /api/uploads (body must stay FormData: no explicit
// content-type, so fetch sets the boundary).
import { env } from "cloudflare:test";
import migrations0002 from "../migrations/0002_e2_recipes_photo_tags.sql?raw";
import m0003Sql from "../migrations/0003_e3_shopping.sql?raw";
import m0005Sql from "../migrations/0005_exercise_steps.sql?raw";
import m0013Sql from "../migrations/0013_alimentos.sql?raw";
import schemaSql from "../schema.sql?raw";
import app from "../src/index";

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
  for (const sql of [m0003Sql, m0005Sql, m0013Sql])
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
  "exercises",
  "recipe_ingredients",
  "foods",
  "recipe_steps",
  "recipe_materials",
  "recipe_tags",
  "recipes",
  "day_notes",
];

/** Fresh tables per test file (files run sequentially in one worker). */
export async function freshDb(): Promise<void> {
  await bootstrap();
  for (const t of TABLES) await env.DB.prepare(`DELETE FROM ${t}`).run();
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

// One real login per worker instance; the digest ships in wrangler.test.toml.
let session: Promise<Record<string, string>> | null = null;
function authCookieHeader(): Promise<Record<string, string>> {
  session ??= (async () => {
    const res = await app.request(
      url("/api/auth/login"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "test-password-123" }),
      },
      env,
    );
    if (res.status !== 200) throw new Error(`test login failed: ${res.status}`);
    return { cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] };
  })();
  return session;
}

/** Request WITHOUT a session (E7 gate contract). */
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
    { headers: await authCookieHeader() },
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
      headers: {
        "content-type": "application/json",
        ...(await authCookieHeader()),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    env,
  );
}

export const post = (path: string, body: unknown) => send(path, "POST", body);
export const put = (path: string, body: unknown) => send(path, "PUT", body);
export async function del(path: string): Promise<Response> {
  return await app.request(
    url(path),
    { method: "DELETE", headers: await authCookieHeader() },
    env,
  );
}

/** E8: multipart POST with the session cookie; body stays FormData so fetch
 *  generates the multipart boundary. */
export async function postForm(
  path: string,
  form: FormData,
): Promise<Response> {
  return await app.request(
    url(path),
    { method: "POST", body: form, headers: await authCookieHeader() },
    env,
  );
}
/** E8: multipart POST WITHOUT a session (gate contract). */
export async function anonPostForm(
  path: string,
  form: FormData,
): Promise<Response> {
  return await app.request(url(path), { method: "POST", body: form }, env);
}
