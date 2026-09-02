// API contract (E1): envelope helpers + healthcheck + idempotent schema.
import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { freshDb, get } from "./helpers";
import { dbFailure, guard } from "../src/http";
import schemaSql from "../schema.sql?raw";

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
    await expect(env.DB.batch([env.DB.prepare(schemaSql)])).resolves.toBeTruthy();
  });
});
