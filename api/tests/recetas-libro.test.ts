// 0014 cambia los ingredientes de las recetas de Nutrirutina (0012) por los del
// libro, enlazados al catálogo, pero solo si la receta sigue como la dejó 0012:
// una receta editada a mano no se toca.
import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import m0012 from "../migrations/0012_recetas_nutrirutina.sql?raw";
import m0014 from "../migrations/0014_recetas_libro.sql?raw";
import { d1, freshDb, get, put } from "./helpers";

async function apply(sql: string): Promise<void> {
  const stmts = sql.split("\n").filter((s) => s.trim() && !s.startsWith("--"));
  await env.DB.batch(stmts.map((s) => env.DB.prepare(s)));
}

type Ing = {
  food: string;
  quantity: number | null;
  unit: string | null;
  foodId: number | null;
};
type R = {
  ingredients: Ing[];
  nutrition: { kcal: number; approximate: boolean };
};

async function recipe(name: string): Promise<R & { id: number }> {
  const found = await d1.get<{ id: number }>(
    "SELECT id FROM recipes WHERE name = ?",
    name,
  );
  const res = await get(`/api/recipes/${found?.id}`);
  const body = (await res.json()) as R;
  return { ...body, id: Number(found?.id) };
}

const ESTRELLADOS = "Huevos estrellados con hash de patatas";
const REVUELTO = "Revuelto de setas (con o sin chorizo)";
const MAGRET = "Magret de pato a baja temperatura con salsa de ciruelas";

describe("0014: ingredientes del libro", () => {
  beforeAll(async () => {
    await freshDb();
    await apply(m0012);
    // El usuario edita una receta importada antes de que llegue 0014.
    const r = await recipe(REVUELTO);
    await put(`/api/recipes/${r.id}`, {
      name: REVUELTO,
      servings: 2,
      ingredients: [{ food: "Huevos camperos", quantity: 6, unit: "ud" }],
    });
    await apply(m0014);
  });

  it("una receta intacta pasa a la lista del libro, enlazada y con huevos", async () => {
    const r = await recipe(ESTRELLADOS);
    expect(r.ingredients[0]).toMatchObject({
      food: "Huevos",
      quantity: 2,
      unit: "ud",
    });
    expect(r.ingredients[0].foodId).not.toBeNull();
    expect(r.nutrition.approximate).toBe(false);
    // Calculado a mano con el catálogo: 2 raciones, huevos incluidos.
    expect(r.nutrition.kcal).toBe(291);
  });

  it("una receta editada a mano se queda como la dejó el usuario", async () => {
    const r = await recipe(REVUELTO);
    expect(r.ingredients.map((i) => i.food)).toEqual(["Huevos camperos"]);
  });

  it("una receta que no está en el libro conserva sus ingredientes, ya enlazados", async () => {
    const r = await recipe(MAGRET);
    expect(r.ingredients.length).toBeGreaterThan(0);
    expect(r.ingredients.every((i) => i.foodId !== null)).toBe(true);
  });

  it("no queda la tabla auxiliar", async () => {
    expect(
      await d1.get("SELECT name FROM sqlite_master WHERE name = '_libro'"),
    ).toBeNull();
  });
});
