// 5.1 RED+GREEN: meal-plan week PUT/GET; slot referencing deleted recipe reads empty.
import { afterAll, describe, expect, it } from "vitest";
import { useTempDb, call, get, put, post, del } from "../helpers";
import * as plan from "@/app/api/meal-plan/[week]/route";
import * as recipes from "@/app/api/recipes/route";
import * as recipeItem from "@/app/api/recipes/[id]/route";

const cleanup = useTempDb();
afterAll(cleanup);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function makeRecipe(name: string): Promise<number> {
  const res = await call(recipes.POST, post("/api/recipes", { name }));
  expect(res.status).toBe(201);
  return Number((await body(res)).id);
}

describe("/api/meal-plan/[week]", () => {
  it("PUT slots then GET returns them with recipe names", async () => {
    const recipeId = await makeRecipe("Ceviche");
    const res = await call(plan.PUT, put("/api/meal-plan/2026-W36", {
      slots: [
        { day: 0, meal: "desayuno", recipeId: recipeId },
        { day: 4, meal: "cena", recipeId: recipeId },
      ],
    }), { week: "2026-W36" });
    expect(res.status).toBe(200);
    const got = await body(await call(plan.GET, get("/api/meal-plan/2026-W36"), { week: "2026-W36" }));
    const slots = got.slots as { day: number; meal: string; recipeId: number; recipeName: string }[];
    expect(slots.length).toBe(2);
    const cena = slots.find((s) => s.day === 4 && s.meal === "cena");
    expect(cena?.recipeName).toBe("Ceviche");
  });

  it("PUT replaces the week: omitted slots disappear", async () => {
    const id1 = await makeRecipe("Uno");
    const id2 = await makeRecipe("Dos");
    await call(plan.PUT, put("/api/meal-plan/2026-W37", {
      slots: [{ day: 0, meal: "desayuno", recipeId: id1 }, { day: 1, meal: "almuerzo", recipeId: id2 }],
    }), { week: "2026-W37" });
    await call(plan.PUT, put("/api/meal-plan/2026-W37", {
      slots: [{ day: 2, meal: "cena", recipeId: id1 }],
    }), { week: "2026-W37" });
    const got = await body(await call(plan.GET, get("/api/meal-plan/2026-W37"), { week: "2026-W37" }));
    const slots = got.slots as unknown[];
    expect(slots.length).toBe(1);
  });

  it("deleting a referenced recipe makes the slot read empty (no dangling error)", async () => {
    const id = await makeRecipe("Temporera");
    await call(plan.PUT, put("/api/meal-plan/2026-W38", {
      slots: [{ day: 3, meal: "almuerzo", recipeId: id }],
    }), { week: "2026-W38" });
    const delRes = await call(recipeItem.DELETE, del(`/api/recipes/${id}`), { id: String(id) });
    expect(delRes.status).toBe(204);
    const got = await body(await call(plan.GET, get("/api/meal-plan/2026-W38"), { week: "2026-W38" }));
    const slots = got.slots as { day: number; meal: string; recipeId: number | null; recipeName: string | null }[];
    expect(slots.length).toBe(1);
    expect(slots[0].day).toBe(3);
    expect(slots[0].recipeId).toBeNull();
    expect(slots[0].recipeName).toBeNull();
  });

  it("GET unknown week → 200 with empty slots", async () => {
    const res = await call(plan.GET, get("/api/meal-plan/2030-W01"), { week: "2030-W01" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isoWeek: "2030-W01", slots: [] });
  });

  it("400 on invalid week", async () => {
    const res = await call(plan.GET, get("/api/meal-plan/semana-mala"), { week: "semana-mala" });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("week");
  });

  it("400 on invalid meal or day", async () => {
    const res = await call(plan.PUT, put("/api/meal-plan/2026-W39", {
      slots: [{ day: 9, meal: "merienda", recipeId: 1 }],
    }), { week: "2026-W39" });
    expect(res.status).toBe(400);
  });

  it("400 on duplicate (day, meal) in one PUT", async () => {
    const id = await makeRecipe("Duplicada");
    const res = await call(plan.PUT, put("/api/meal-plan/2026-W40", {
      slots: [
        { day: 1, meal: "cena", recipeId: id },
        { day: 1, meal: "cena", recipeId: id },
      ],
    }), { week: "2026-W40" });
    expect(res.status).toBe(400);
  });
});
