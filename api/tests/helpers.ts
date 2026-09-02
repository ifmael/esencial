// Shared test helpers: real local D1 (miniflare via vitest-pool-workers) +
// fetch-style request builders against the Hono app. Parity with E1 helpers.
import { env } from "cloudflare:test";
import app from "../src/index";
import schemaSql from "../schema.sql?raw";

let bootstrapped = false;

/** Apply api/schema.sql once per worker instance (idempotent IF NOT EXISTS). */
async function bootstrap(): Promise<void> {
  if (bootstrapped) return;
  // batch() runs a multi-statement query when unbound: schema applies atomically.
  await env.DB.batch([env.DB.prepare(schemaSql)]);
  bootstrapped = true;
}

// Child-before-parent order keeps FK checks happy if enforcement is on.
const TABLES = [
  "set_logs",
  "workout_logs",
  "plan_sessions",
  "meal_slots",
  "week_plans",
  "template_exercises",
  "session_templates",
  "exercise_tags",
  "exercises",
  "recipe_ingredients",
  "recipe_steps",
  "recipe_materials",
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
    const { meta } = await env.DB.prepare(sql).bind(...(args as never[])).run();
    return Number(meta.last_row_id);
  },
  async get<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T | null> {
    return await env.DB.prepare(sql).bind(...(args as never[])).first<T>();
  },
  async all<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T[]> {
    const { results } = await env.DB.prepare(sql).bind(...(args as never[])).all<T>();
    return results ?? [];
  },
};

function url(path: string): string {
  return `http://localhost${path}`;
}

export async function get(path: string): Promise<Response> {
  return await app.request(url(path), {}, env);
}

export async function send(path: string, method: string, body: unknown): Promise<Response> {
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

export const post = (path: string, body: unknown) => send(path, "POST", body);
export const put = (path: string, body: unknown) => send(path, "PUT", body);
export async function del(path: string): Promise<Response> {
  return await app.request(url(path), { method: "DELETE" }, env);
}
