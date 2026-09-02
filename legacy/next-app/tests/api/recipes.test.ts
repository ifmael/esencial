// 2.1/2.3/2.4 RED: recipes CRUD with ordered ingredients/steps/materials,
// 400 without name (nothing written), PUT/DELETE with cascade children.
import { afterAll, describe, expect, it } from "vitest";
import { useTempDb, call, get, post, put, del } from "../helpers";
import * as collection from "@/app/api/recipes/route";
import * as item from "@/app/api/recipes/[id]/route";

const cleanup = useTempDb();
afterAll(cleanup);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/recipes", () => {
  it("creates recipe with nested children and returns 201", async () => {
    const res = await call(collection.POST, post("/api/recipes", {
      name: "Tacos de pescado",
      description: "Crispitos",
      servings: 4,
      ingredients: [
        { food: "pescado", quantity: 300, unit: "g" },
        { food: "tortilla", quantity: 8, unit: "ud" },
        { food: "ajo", quantity: 2, unit: "diente" },
      ],
      steps: ["Freír pescado", "Desmigar", "Calentar tortillas", "Armar"],
      materials: ["sartén", "espátula"],
    }));
    expect(res.status).toBe(201);
    const r = await body(res);
    expect(r.name).toBe("Tacos de pescado");
    expect(typeof r.id).toBe("number");
  });

  it("GET by id returns ingredients ordered as entered and steps numbered 1..N", async () => {
    const created = await call(collection.POST, post("/api/recipes", {
      name: "Gazpacho",
      ingredients: [
        { food: "tomate", quantity: 500, unit: "g" },
        { food: "pepino", quantity: 200, unit: "g" },
        { food: "ajo", quantity: 1, unit: "diente" },
      ],
      steps: ["Triturar", "Refrigerar", "Servir"],
    }));
    const id = Number((await body(created)).id);
    const res = await call(item.GET, get(`/api/recipes/${id}`), { id: String(id) });
    expect(res.status).toBe(200);
    const r = await body(res);
    const foods = (r.ingredients as { food: string }[]).map((i) => i.food);
    expect(foods).toEqual(["tomate", "pepino", "ajo"]);
    const steps = r.steps as { step: number; text: string }[];
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3]);
    expect(steps[2].text).toBe("Servir");
    expect(r.materials).toEqual([]);
  });

  it("GET list returns all recipes", async () => {
    const res = await call(collection.GET, get("/api/recipes"));
    expect(res.status).toBe(200);
    const list = (await res.json()) as unknown[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it("400 {error, field} without name, nothing written", async () => {
    const before = await (await call(collection.GET, get("/api/recipes"))).json();
    const res = await call(collection.POST, post("/api/recipes", { servings: 2 }));
    expect(res.status).toBe(400);
    const r = await body(res);
    expect(typeof r.error).toBe("string");
    expect(r.field).toBe("name");
    const after = await (await call(collection.GET, get("/api/recipes"))).json();
    expect(after).toEqual(before);
  });

  it("400 on malformed JSON body", async () => {
    const res = await call(collection.POST, post("/api/recipes", "{nope"));
    expect(res.status).toBe(400);
    const r = await body(res);
    expect(r.field).toBe("body");
  });

  it("400 on duplicate name (UNIQUE)", async () => {
    const res = await call(collection.POST, post("/api/recipes", { name: "Gazpacho" }));
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("name");
  });
});

describe("/api/recipes/[id] PUT/DELETE", () => {
  it("PUT replaces ordered children", async () => {
    const created = await body(await call(collection.POST, post("/api/recipes", {
      name: "Puré",
      ingredients: [{ food: "papa", quantity: 400, unit: "g" }],
      steps: ["Hervir", "Pisar"],
    })));
    const id = Number(created.id);
    const res = await call(item.PUT, put(`/api/recipes/${id}`, {
      name: "Puré rústico",
      ingredients: [
        { food: "papa", quantity: 500, unit: "g" },
        { food: "manteca", quantity: 20, unit: "g" },
      ],
      steps: ["Hervir con piel", "Pisar grueso"],
      materials: ["papa-masher"],
    }), { id: String(id) });
    expect(res.status).toBe(200);
    const got = await body(await call(item.GET, get(`/api/recipes/${id}`), { id: String(id) }));
    const ing = got.ingredients as { food: string }[];
    expect(ing.map((i) => i.food)).toEqual(["papa", "manteca"]);
    expect((got.steps as unknown[]).length).toBe(2);
    expect(got.materials).toEqual(["papa-masher"]);
  });

  it("DELETE cascades children", async () => {
    const created = await body(await call(collection.POST, post("/api/recipes", {
      name: "Temporal",
      ingredients: [{ food: "x" }],
      steps: ["s"],
      materials: ["olla"],
    })));
    const id = Number(created.id);
    const res = await call(item.DELETE, del(`/api/recipes/${id}`), { id: String(id) });
    expect(res.status).toBe(204);
    expect((await call(item.GET, get(`/api/recipes/${id}`), { id: String(id) })).status).toBe(404);
  });

  it("404 for unknown id", async () => {
    const res = await call(item.GET, get("/api/recipes/999999"), { id: "999999" });
    expect(res.status).toBe(404);
  });

  it("400 for non-numeric id (fail closed)", async () => {
    const res = await call(item.GET, get("/api/recipes/abc"), { id: "abc" });
    expect(res.status).toBe(400);
  });
});
