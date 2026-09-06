// API contract (E1): envelope helpers + healthcheck + idempotent schema.
import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { d1, freshDb, get } from "./helpers";
import { dbFailure, guard } from "../src/http";
import schemaSql from "../schema.sql?raw";
import m0003 from "../migrations/0003_e3_shopping.sql?raw";

beforeAll(freshDb);

describe("error envelope", () => {
  it("unknown DB error maps to generic 500", async () => {
    const res = await guard(async () => {
      throw new Error("SQLITE_INTERNAL_Yikes: corrupt index page 42");
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string; field?: string };
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error).not.toMatch(/SQL|corrupt|index/i);
  });

  it("UNIQUE violation maps to 400 with the field", async () => {
    const res = dbFailure(new Error("UNIQUE constraint failed: recipes.name"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field: string };
    expect(body.field).toBe("name");
  });
});

describe("worker surface", () => {
  it("GET /api/health → { ok: true }", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("unknown /api path → 404 { error }", async () => {
    const res = await get("/api/nada");
    expect(res.status).toBe(404);
    expect(Object.keys((await res.json()) as object)).toEqual(["error"]);
  });

  it("schema.sql is idempotent (second apply is a no-op)", async () => {
    await expect(
      env.DB.batch([env.DB.prepare(schemaSql)]),
    ).resolves.toBeTruthy();
  });
});

describe("e3 shopping migration (D1 runner semantics)", () => {
  it("shopping_items table + recipe_ingredients.section exist after freshDb", async () => {
    const shop = await d1.all(
      `SELECT name FROM pragma_table_info('shopping_items')`,
    );
    expect(shop.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "id",
        "week_plan_id",
        "position",
        "food",
        "quantity",
        "unit",
        "section",
        "checked",
      ]),
    );
    const ri = await d1.all(
      `SELECT name FROM pragma_table_info('recipe_ingredients')`,
    );
    expect(ri.map((c) => c.name)).toContain("section");
  });

  it("re-applying bootstrap + CREATE IF NOT EXISTS neither errors nor duplicates", async () => {
    // The wrangler runner owns ALTER idempotency (_cf_D1_MIGRATIONS); the test
    // bootstrap is guarded by a once-flag and CREATE TABLE IF NOT EXISTS is
    // replay-safe by SQL. Neither path may error or duplicate.
    await expect(freshDb()).resolves.toBeUndefined();
    await expect(
      env.DB.batch([env.DB.prepare(/CREATE TABLE[^;]+;/.exec(m0003)![0])]),
    ).resolves.toBeTruthy();
    const { count } = (await d1.get(
      `SELECT COUNT(*) AS count FROM shopping_items`,
    ))!;
    expect(count).toBe(0);
    const ri = await d1.all(
      `SELECT name FROM pragma_table_info('recipe_ingredients')`,
    );
    expect(ri.filter((c) => c.name === "section").length).toBe(1);
  });
});
