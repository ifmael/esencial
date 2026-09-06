// E3: GET /api/shopping-list/:week (agregación server-side, diseño D4) +
// PUT/GET/PATCH de ítems manuales (D5). Seeds reales vía /api/recipes y
// /api/meal-plan para probar la cadena completa.
import { beforeAll, describe, expect, it } from "vitest";
import { del, freshDb, get, post, put, send } from "./helpers";

beforeAll(freshDb);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function makeRecipe(
  name: string,
  ingredients: unknown[],
): Promise<number> {
  const res = await post("/api/recipes", { name, ingredients });
  expect(res.status).toBe(201);
  return Number((await body(res)).id);
}

type ListItem = {
  source: string;
  food: string;
  quantity: number | null;
  unit: string | null;
  checked?: boolean;
  id?: number;
  recipeIds?: number[];
  count?: number;
};
type Section = { section: string; items: ListItem[] };

async function sections(week: string): Promise<Section[]> {
  const b = await body(await get(`/api/shopping-list/${week}`));
  return b.sections as Section[];
}

const findItem = (
  secs: Section[],
  section: string,
  food: string,
): ListItem | undefined =>
  secs
    .find((s) => s.section === section)
    ?.items.find((i) => i.food.toLowerCase() === food.toLowerCase());

describe("GET /api/shopping-list/:week", () => {
  it("unknown valid week → { isoWeek, sections: [] }", async () => {
    const res = await get("/api/shopping-list/2030-W01");
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ isoWeek: "2030-W01", sections: [] });
  });

  it("invalid week format → 400 { field: 'week' }", async () => {
    const res = await get("/api/shopping-list/semana-mala");
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("week");
  });

  it("aggregates: slot multiplier, case-insensitive food+unit merge, NULL quantity, keyword map, fixed section order", async () => {
    const ens = await makeRecipe("Ensalada", [
      { food: "tomate", quantity: 200, unit: "g" },
      { food: "lechuga", quantity: 1, unit: "ud" },
      { food: "pechuga de pollo", quantity: 150, unit: "g" },
      { food: "Leche", quantity: 100, unit: "ml" },
      { food: "aceite de oliva" },
    ]);
    const brus = await makeRecipe("Bruschetta", [
      { food: "Tomate", quantity: 100, unit: "g" }, // merge case-insensitive con "tomate"
      { food: "garum", quantity: 5, unit: "g" }, // comida desconocida → Despensa
    ]);
    await put("/api/meal-plan/2026-W36", {
      slots: [
        { day: 0, meal: "almuerzo", recipeId: ens },
        { day: 1, meal: "almuerzo", recipeId: ens }, // ensalada ×2
        { day: 2, meal: "cena", recipeId: brus },
      ],
    });
    const secs = await sections("2026-W36");
    expect(secs.map((s) => s.section)).toEqual([
      "Frutas y verduras",
      "Carnes",
      "Lácteos",
      "Despensa",
    ]);
    // tomate: 200 g × 2 slots + 100 g × 1 slot = 500 g en una sola línea
    const tomate = findItem(secs, "Frutas y verduras", "tomate")!;
    expect(tomate.quantity).toBe(500);
    expect(tomate.unit).toBe("g");
    expect(tomate.recipeIds?.sort()).toEqual([brus, ens].sort());
    expect(tomate.count).toBe(3);
    expect(findItem(secs, "Frutas y verduras", "lechuga")!.quantity).toBe(2);
    expect(findItem(secs, "Carnes", "pechuga de pollo")!.quantity).toBe(300);
    expect(findItem(secs, "Lácteos", "Leche")!.quantity).toBe(200);
    // NULL quantity → línea sin cantidad, no descartada
    const aceite = findItem(secs, "Despensa", "aceite de oliva")!;
    expect(aceite.quantity).toBeNull();
    expect(findItem(secs, "Despensa", "garum")!.quantity).toBe(5);
    // misma comida, distinta unidad → dos líneas
    const panA = await makeRecipe("Pudín", [
      { food: "pan", quantity: 4, unit: "rebanada" },
    ]);
    const panB = await makeRecipe("Migas", [
      { food: "pan", quantity: 200, unit: "g" },
    ]);
    await put("/api/meal-plan/2026-W37", {
      slots: [
        { day: 0, meal: "desayuno", recipeId: panA },
        { day: 1, meal: "cena", recipeId: panB },
      ],
    });
    const secs2 = await sections("2026-W37");
    const pans = secs2
      .find((s) => s.section === "Despensa")!
      .items.filter((i) => i.food === "pan");
    expect(pans.length).toBe(2);
  });

  it("explicit ingredient section beats the keyword map; section round-trips via GET /api/recipes/:id", async () => {
    const id = await makeRecipe("Salsa rápida", [
      {
        food: "tomate triturado",
        quantity: 400,
        unit: "g",
        section: "Despensa",
      },
    ]);
    await put("/api/meal-plan/2026-W44", {
      slots: [{ day: 3, meal: "almuerzo", recipeId: id }],
    });
    const secs = await sections("2026-W44");
    expect(secs.map((s) => s.section)).toEqual(["Despensa"]);
    expect(findItem(secs, "Despensa", "tomate triturado")!.quantity).toBe(400);
    const recipe = await body(await get(`/api/recipes/${id}`));
    const ing = (recipe.ingredients as Record<string, unknown>[])[0];
    expect(ing.section).toBe("Despensa");
  });

  it("composed view mixes manual items; other sections alphabetical after the fixed four", async () => {
    const ens = await makeRecipe("Tostada", [
      { food: "tomate", quantity: 1, unit: "ud" },
    ]);
    await put("/api/meal-plan/2026-W45", {
      slots: [{ day: 0, meal: "desayuno", recipeId: ens }],
    });
    const res = await put("/api/shopping-list/2026-W45/items", {
      items: [
        { food: "helado", section: "Congelados" },
        { food: "agua", section: "Bebidas", checked: true },
      ],
    });
    expect(res.status).toBe(200);
    const secs = await sections("2026-W45");
    expect(secs.map((s) => s.section)).toEqual([
      "Frutas y verduras",
      "Bebidas",
      "Congelados",
    ]);
    const agua = findItem(secs, "Bebidas", "agua")!;
    expect(agua.source).toBe("manual");
    expect(agua.checked).toBe(true);
    expect(findItem(secs, "Frutas y verduras", "tomate")!.source).toBe(
      "recipe",
    );
  });

  it("deleting a planned recipe removes its lines; manual lines survive", async () => {
    const id = await makeRecipe("Tortilla", [
      { food: "huevos", quantity: 3, unit: "ud" },
    ]);
    await put("/api/meal-plan/2026-W46", {
      slots: [{ day: 5, meal: "cena", recipeId: id }],
    });
    await put("/api/shopping-list/2026-W46/items", {
      items: [{ food: "Pan" }],
    });
    let secs = await sections("2026-W46");
    expect(findItem(secs, "Carnes", "huevos")).toBeDefined();
    expect((await del(`/api/recipes/${id}`)).status).toBe(204);
    secs = await sections("2026-W46");
    expect(findItem(secs, "Carnes", "huevos")).toBeUndefined();
    expect(findItem(secs, "Despensa", "Pan")!.source).toBe("manual");
  });
});

describe("manual items CRUD", () => {
  it("PUT creates the week_plans row lazily, assigns positions; second PUT replaces wholesale; GET reads them", async () => {
    const res = await put("/api/shopping-list/2026-W41/items", {
      items: [
        { food: "Pan" },
        { food: "Aceitunas", quantity: 2, unit: "ud", checked: true },
      ],
    });
    expect(res.status).toBe(200);
    let items = (await body(res)).items as Record<string, unknown>[];
    expect(items.map((i) => i.position)).toEqual([0, 1]);
    expect(items[1].checked).toBe(true);
    // semana inexistente antes del PUT: el composed GET ya la ve (week_plans creado)
    await put("/api/shopping-list/2026-W41/items", {
      items: [{ food: "Pan" }],
    });
    const got = await body(await get("/api/shopping-list/2026-W41/items"));
    items = got.items as Record<string, unknown>[];
    expect(items.length).toBe(1);
    expect(items[0].food).toBe("Pan");
    expect(items[0].checked).toBe(false);
  });

  it("empty food → 400 { field } with nothing written", async () => {
    const before = await body(await get("/api/shopping-list/2026-W41/items"));
    const res = await put("/api/shopping-list/2026-W41/items", {
      items: [{ food: "Pan" }, { food: "" }],
    });
    expect(res.status).toBe(400);
    expect(String((await body(res)).field)).toContain("food");
    expect(await body(await get("/api/shopping-list/2026-W41/items"))).toEqual(
      before,
    );
  });

  it("PATCH flips only checked; updates given fields; unknown id → 404; empty body → 400", async () => {
    const created = await body(
      await put("/api/shopping-list/2026-W42/items", {
        items: [{ food: "Agua", quantity: 1, unit: "l" }],
      }),
    );
    const id = Number((created.items as Record<string, unknown>[])[0].id);
    const patched = await body(
      await send("/api/shopping-list/2026-W42/items/" + id, "PATCH", {
        checked: true,
      }),
    );
    expect(patched).toMatchObject({
      id,
      food: "Agua",
      quantity: 1,
      checked: true,
    });
    const multi = await body(
      await send("/api/shopping-list/2026-W42/items/" + id, "PATCH", {
        food: "X",
        quantity: 2,
      }),
    );
    expect(multi).toMatchObject({ food: "X", quantity: 2, checked: true });
    const missing = await send(
      "/api/shopping-list/2026-W42/items/999999",
      "PATCH",
      { checked: true },
    );
    expect(missing.status).toBe(404);
    expect(Object.keys(await body(missing))).toEqual(["error"]);
    const empty = await send(
      "/api/shopping-list/2026-W42/items/" + id,
      "PATCH",
      {},
    );
    expect(empty.status).toBe(400);
  });

  it("unknown fields are rejected and week format is validated on item routes", async () => {
    const list = (await body(await get("/api/shopping-list/2026-W42/items")))
      .items as Record<string, unknown>[];
    const bad = await send(
      `/api/shopping-list/2026-W42/items/${list[0].id}`,
      "PATCH",
      { precio: 3 },
    );
    expect(bad.status).toBe(400);
    const week = await put("/api/shopping-list/no-existe/items", {
      items: [{ food: "Pan" }],
    });
    expect(week.status).toBe(400);
    expect((await body(week)).field).toBe("week");
  });
});
