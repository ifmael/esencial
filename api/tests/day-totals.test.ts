// Totales del día: cada comida planificada cuenta 1 ración de su receta.
// /api/day/:date devuelve `nutrition` (null sin recetas) y /api/meal-plan/:week
// `totals`, uno por día de la semana (null en los días sin recetas).
import { beforeAll, describe, expect, it } from "vitest";
import { d1, devGet, devSend, freshDb, get, post, put } from "./helpers";

beforeAll(freshDb);

type Nutrition = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  approximate: boolean;
};

async function recipe(
  name: string,
  body: Record<string, unknown>,
): Promise<number> {
  const res = await post("/api/recipes", { name, ...body });
  const created = (await res.json()) as { id: number };
  return created.id;
}

const W40 = "2026-W40"; // lunes 2026-09-28; miércoles = día 2
const W41 = "2026-W41"; // lunes 2026-10-05; miércoles = 2026-10-07

describe("totales del día", () => {
  let tortilla: number;
  let ensalada: number;
  let sinDatos: number;

  beforeAll(async () => {
    const huevos = await d1.run(
      "INSERT INTO foods (name, kcal, protein, fat, carbs, grams_per_unit) VALUES ('Huevos', 150, 12, 10, 1, 50)",
    );
    const lechuga = await d1.run(
      "INSERT INTO foods (name, kcal, protein, fat, carbs) VALUES ('Lechuga', 20, 1, 0, 3)",
    );
    // 4 huevos (200 g) para 2 raciones → 150 kcal, 12 p, 10 g, 1 c por ración
    tortilla = await recipe("Tortilla", {
      servings: 2,
      ingredients: [
        { food: "Huevos", quantity: 4, unit: "ud", foodId: huevos },
      ],
    });
    // 100 g de lechuga, sin raciones → 20 kcal, 1 p, 0 g, 3 c
    ensalada = await recipe("Ensalada", {
      ingredients: [
        { food: "Lechuga", quantity: 100, unit: "gr", foodId: lechuga },
      ],
    });
    sinDatos = await recipe("Sin enlazar", {
      ingredients: [{ food: "Pan", quantity: 50, unit: "gr" }],
    });
    await put(`/api/meal-plan/${W40}`, {
      slots: [
        { day: 2, meal: "desayuno", recipeId: tortilla },
        { day: 2, meal: "cena", recipeId: ensalada },
        { day: 4, meal: "almuerzo", recipeId: sinDatos },
        { day: 5, meal: "almuerzo", recipeId: null },
      ],
    });
  });

  it("/api/day suma una ración de cada comida del día", async () => {
    const day = (await (await get("/api/day/2026-09-30")).json()) as {
      nutrition: Nutrition | null;
    };
    expect(day.nutrition).toEqual({
      kcal: 170,
      protein: 13,
      fat: 10,
      carbs: 4,
      approximate: false,
    });
  });

  it("/api/day sin recetas → nutrition null", async () => {
    const day = (await (await get("/api/day/2026-10-03")).json()) as {
      nutrition: Nutrition | null;
    };
    expect(day.nutrition).toBeNull();
  });

  it("/api/meal-plan devuelve un total por día (null sin recetas) y lo aproximado", async () => {
    const plan = (await (await get(`/api/meal-plan/${W40}`)).json()) as {
      totals: (Nutrition | null)[];
    };
    expect(plan.totals).toHaveLength(7);
    expect(plan.totals[2]).toMatchObject({ kcal: 170, approximate: false });
    expect(plan.totals[4]).toMatchObject({ kcal: 0, approximate: true });
    expect(plan.totals[5]).toBeNull();
    expect(plan.totals[0]).toBeNull();
  });

  it("el día suma las comidas de la FAMILIA: los menús no cruzan", async () => {
    // La cookie resuelve al admin; /api/me lo autoprovisiona y da su familia.
    const me = (await (await get("/api/me")).json()) as { familyId: number };
    const adminFamily = me.familyId;
    await d1.run(
      "INSERT INTO users (email, role, family_id) VALUES (?, 'member', ?)",
      "hermano@esencial.test",
      adminFamily,
    );
    const otraFamilia = await d1.run(
      "INSERT INTO families (name) VALUES ('Otra')",
    );
    await d1.run(
      "INSERT INTO users (email, role, family_id) VALUES (?, 'member', ?)",
      "ajeno@esencial.test",
      otraFamilia,
    );

    // W41 (miércoles 2026-10-07): el admin planifica desayuno; la otra familia,
    // cena en el MISMO día. Cada /api/day ve solo lo de su familia.
    await put(`/api/meal-plan/${W41}`, {
      slots: [{ day: 2, meal: "desayuno", recipeId: tortilla }],
    });
    await devSend(
      `/api/meal-plan/${W41}`,
      "PUT",
      { slots: [{ day: 2, meal: "cena", recipeId: ensalada }] },
      "ajeno@esencial.test",
    );

    const hermana = (await (
      await devGet("/api/day/2026-10-07", "hermano@esencial.test")
    ).json()) as { meals: { meal: string }[] };
    expect(hermana.meals.map((m) => m.meal)).toEqual(["desayuno"]);
    const ajena = (await (
      await devGet("/api/day/2026-10-07", "ajeno@esencial.test")
    ).json()) as { meals: { meal: string }[] };
    expect(ajena.meals.map((m) => m.meal)).toEqual(["cena"]);
  });
});
