// API contract: unexpected DB failure → 500 {error} without SQL internals.
import { describe, expect, it } from "vitest";
import { dbFailure, guard } from "@/lib/api";

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

  it("UNIQUE violation maps to 400 with the field", () => {
    const res = dbFailure(new Error("UNIQUE constraint failed: recipes.name"));
    expect(res.status).toBe(400);
    return res.json().then((body) => {
      const b = body as { error: string; field: string };
      expect(b.field).toBe("name");
      expect(typeof b.error).toBe("string");
    });
  });
});
