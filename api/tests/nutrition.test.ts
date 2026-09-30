// Macros por ración: se calculan al leer la receta desde el catálogo `foods`
// (valores por 100 g/ml; `grams_per_unit` convierte «ud» a gramos). Lo
// opcional no cuenta; un ingrediente con cantidad sin alimento enlazado (o en
// una unidad que no se sabe convertir) deja la cifra marcada como aproximada.
import { beforeAll, describe, expect, it } from "vitest";
import { d1, freshDb, get, post, put } from "./helpers";

beforeAll(freshDb);

type Nutrition = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  approximate: boolean;
};
type Ing = { food: string; foodId: number | null; optional: boolean };
type R = { id: number; ingredients: Ing[]; nutrition: Nutrition };

async function food(
  name: string,
  kcal: number,
  protein: number,
  fat: number,
  carbs: number,
  gramsPerUnit: number | null = null,
): Promise<number> {
  return await d1.run(
    "INSERT INTO foods (name, kcal, protein, fat, carbs, grams_per_unit) VALUES (?, ?, ?, ?, ?, ?)",
    name,
    kcal,
    protein,
    fat,
    carbs,
    gramsPerUnit,
  );
}

async function create(body: unknown): Promise<R> {
  const res = await post("/api/recipes", body);
  expect(res.status).toBe(201);
  // Respuesta de nuestra propia API (201 comprobado arriba).
  const created = (await res.json()) as { id: number };
  const id = created.id;
  return (await (await get(`/api/recipes/${id}`)).json()) as R;
}

let patata: number;
let huevos: number;

describe("macros por ración", () => {
  beforeAll(async () => {
    patata = await food("Patatas", 77, 2, 0.1, 17);
    huevos = await food("Huevos", 155, 12.6, 10.6, 1.1, 55);
  });

  it("suma gramos y unidades, divide entre raciones y no cuenta lo opcional", async () => {
    const r = await create({
      name: "Hash con huevos",
      servings: 2,
      ingredients: [
        { food: "Patatas", quantity: 300, unit: "gr", foodId: patata },
        { food: "Huevos", quantity: 2, unit: "ud", foodId: huevos },
        {
          food: "Huevo extra (opcional)",
          quantity: 1,
          unit: "ud",
          foodId: huevos,
          optional: true,
        },
        { food: "Sal", quantity: null, unit: null },
      ],
    });
    // (300 g patata + 110 g huevo) / 2 raciones
    expect(r.nutrition).toEqual({
      kcal: Math.round((231 + 170.5) / 2),
      protein: Math.round((6 + 13.86) / 2),
      fat: Math.round((0.3 + 11.66) / 2),
      carbs: Math.round((51 + 1.21) / 2),
      approximate: false,
    });
    expect(r.ingredients.map((i) => [i.foodId, i.optional])).toEqual([
      [patata, false],
      [huevos, false],
      [huevos, true],
      [null, false],
    ]);
  });

  it("sin raciones cuenta la receta entera como una", async () => {
    const r = await create({
      name: "Patata sola",
      ingredients: [
        { food: "Patatas", quantity: 100, unit: "gr", foodId: patata },
      ],
    });
    expect(r.nutrition.kcal).toBe(77);
  });

  it("un ingrediente con cantidad sin enlazar o sin conversión la marca aproximada", async () => {
    const sinEnlace = await create({
      name: "Con pimiento libre",
      ingredients: [
        { food: "Patatas", quantity: 100, unit: "gr", foodId: patata },
        { food: "Pimiento", quantity: 40, unit: "gr" },
      ],
    });
    expect(sinEnlace.nutrition).toMatchObject({ kcal: 77, approximate: true });
    const sinPeso = await create({
      name: "Patata en unidades",
      ingredients: [
        { food: "Patata", quantity: 2, unit: "ud", foodId: patata },
      ],
    });
    expect(sinPeso.nutrition).toMatchObject({ kcal: 0, approximate: true });
  });

  it("el PUT conserva foodId y optional", async () => {
    const r = await create({
      name: "Para editar",
      ingredients: [
        {
          food: "Huevos",
          quantity: 1,
          unit: "ud",
          foodId: huevos,
          optional: true,
        },
      ],
    });
    const res = await put(`/api/recipes/${r.id}`, {
      name: "Para editar",
      servings: 1,
      ingredients: [
        {
          food: "Huevos",
          quantity: 3,
          unit: "ud",
          foodId: huevos,
          optional: false,
        },
      ],
    });
    expect(res.status).toBe(200);
    const got = (await (await get(`/api/recipes/${r.id}`)).json()) as R;
    expect(got.ingredients[0]).toMatchObject({
      foodId: huevos,
      optional: false,
    });
    expect(got.nutrition.kcal).toBe(Math.round(155 * 1.65));
  });

  it("400 {field} si foodId no existe en el catálogo, sin escribir nada", async () => {
    const res = await post("/api/recipes", {
      name: "Alimento fantasma",
      ingredients: [
        { food: "Patatas", quantity: 1, unit: "gr", foodId: patata },
        { food: "X", quantity: 1, unit: "gr", foodId: 999999 },
      ],
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as { field: string };
    expect(err.field).toBe("ingredients.1.foodId");
    expect(
      await d1.get("SELECT id FROM recipes WHERE name = 'Alimento fantasma'"),
    ).toBeNull();
  });
});
