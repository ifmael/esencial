// E1 parity: meal-plan week PUT/GET; slot referencing deleted recipe reads empty.
import { beforeAll, describe, expect, it } from "vitest";
import { del, freshDb, get, post, put } from "./helpers";

beforeAll(freshDb);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function makeRecipe(name: string): Promise<number> {
  const res = await post("/api/recipes", { name });
  expect(res.status).toBe(201);
  return Number((await body(res)).id);
}

describe("/api/meal-plan/:week", () => {
  it("PUT slots then GET returns them with recipe names", async () => {
    const recipeId = await makeRecipe("Ceviche");
    const res = await put("/api/meal-plan/2026-W36", {
      slots: [
        { day: 0, meal: "desayuno", recipeId: recipeId },
        { day: 4, meal: "cena", recipeId: recipeId },
      ],
    });
    expect(res.status).toBe(200);
    const got = await body(await get("/api/meal-plan/2026-W36"));
    const slots = got.slots as {
      day: number;
      meal: string;
      recipeId: number;
      recipeName: string;
    }[];
    expect(slots.length).toBe(2);
    const cena = slots.find((s) => s.day === 4 && s.meal === "cena");
    expect(cena?.recipeName).toBe("Ceviche");
  });

  it("PUT replaces the week: omitted slots disappear", async () => {
    const id1 = await makeRecipe("Uno");
    const id2 = await makeRecipe("Dos");
    await put("/api/meal-plan/2026-W37", {
      slots: [
        { day: 0, meal: "desayuno", recipeId: id1 },
        { day: 1, meal: "almuerzo", recipeId: id2 },
      ],
    });
    await put("/api/meal-plan/2026-W37", {
      slots: [{ day: 2, meal: "cena", recipeId: id1 }],
    });
    const got = await body(await get("/api/meal-plan/2026-W37"));
    const slots = got.slots as unknown[];
    expect(slots.length).toBe(1);
  });

  it("deleting a referenced recipe makes the slot read empty (no dangling error)", async () => {
    const id = await makeRecipe("Temporera");
    await put("/api/meal-plan/2026-W38", {
      slots: [{ day: 3, meal: "almuerzo", recipeId: id }],
    });
    const delRes = await del(`/api/recipes/${id}`);
    expect(delRes.status).toBe(204);
    const got = await body(await get("/api/meal-plan/2026-W38"));
    const slots = got.slots as {
      day: number;
      meal: string;
      recipeId: number | null;
      recipeName: string | null;
    }[];
    expect(slots.length).toBe(1);
    expect(slots[0].day).toBe(3);
    expect(slots[0].recipeId).toBeNull();
    expect(slots[0].recipeName).toBeNull();
  });

  it("GET unknown week → 200 with empty slots", async () => {
    const res = await get("/api/meal-plan/2030-W01");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isoWeek: "2030-W01", slots: [] });
  });

  it("400 on invalid week", async () => {
    const res = await get("/api/meal-plan/semana-mala");
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("week");
  });

  it("400 on invalid meal or day", async () => {
    const res = await put("/api/meal-plan/2026-W39", {
      slots: [{ day: 9, meal: "merienda", recipeId: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it("400 on duplicate (day, meal) in one PUT", async () => {
    const id = await makeRecipe("Duplicada");
    const res = await put("/api/meal-plan/2026-W40", {
      slots: [
        { day: 1, meal: "cena", recipeId: id },
        { day: 1, meal: "cena", recipeId: id },
      ],
    });
    expect(res.status).toBe(400);
  });
});
