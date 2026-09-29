// La migración de recetas de Nutrirutina (0012) la genera
// api/scripts/nutrirutina.ts: el SQL que sale de ahí tiene que leerse por la
// API como una receta más, y no tocar una receta que ya exista con ese nombre.
import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { photoKey, toMigrationSql } from "../scripts/nutrirutina";
import { d1, freshDb, get, post } from "./helpers";

beforeAll(freshDb);

async function apply(sql: string): Promise<void> {
  // Una sentencia por línea (así la escribe el generador).
  const stmts = sql.split("\n").filter((s) => s.trim() && !s.startsWith("--"));
  await env.DB.batch(stmts.map((s) => env.DB.prepare(s)));
}

describe("migración de recetas de Nutrirutina", () => {
  it("photoKey es estable y cumple el formato de las fotos de R2", async () => {
    const key = await photoKey("cm9pougu20000xq0da7ga05wd");
    expect(key).toMatch(/^recipe-[0-9a-f-]{36}\.jpg$/);
    expect(await photoKey("cm9pougu20000xq0da7ga05wd")).toBe(key);
    expect(await photoKey("otro")).not.toBe(key);
  });

  it("importa ingredientes, pasos, materiales y foto; «al gusto» sin cantidad", async () => {
    await apply(
      toMigrationSql([
        {
          name: "Pan d'ajo",
          description: null,
          servings: 2,
          photo_path: "recipe-00000000-0000-0000-0000-000000000000.jpg",
          ingredients: [
            { food: "Pan", quantity: 150, unit: "g" },
            { food: "Leche", quantity: 40, unit: "ml" },
            { food: "Sal", quantity: -1, unit: "g" },
          ],
          steps: ["Tuesta el pan; frota el ajo.", "Sirve"],
          materials: ["Tostadora"],
        },
      ]),
    );
    const list = (await (await get("/api/recipes")).json()) as {
      id: number;
      name: string;
    }[];
    const id = list.find((r) => r.name === "Pan d'ajo")?.id;
    const r = (await (await get(`/api/recipes/${id}`)).json()) as Record<
      string,
      unknown
    >;
    expect(r.servings).toBe(2);
    expect(r.photo_path).toBe(
      "recipe-00000000-0000-0000-0000-000000000000.jpg",
    );
    expect(
      (
        r.ingredients as { food: string; quantity: unknown; unit: unknown }[]
      ).map(({ food, quantity, unit }) => ({ food, quantity, unit })),
    ).toEqual([
      { food: "Pan", quantity: 150, unit: "gr" },
      { food: "Leche", quantity: 40, unit: "ml" },
      { food: "Sal", quantity: null, unit: null },
    ]);
    expect((r.steps as { text: string }[]).map((s) => s.text)).toEqual([
      "Tuesta el pan; frota el ajo.",
      "Sirve",
    ]);
    expect(r.materials).toEqual(["Tostadora"]);
  });

  it("una receta que ya existe con el mismo nombre se queda como estaba", async () => {
    await post("/api/recipes", {
      name: "Gazpacho",
      ingredients: [{ food: "tomate", quantity: 500, unit: "gr" }],
    });
    await apply(
      toMigrationSql([
        {
          name: "Gazpacho",
          description: "otra",
          servings: 4,
          photo_path: null,
          ingredients: [{ food: "pepino", quantity: 1, unit: "g" }],
          steps: ["Triturar"],
          materials: ["Batidora"],
        },
      ]),
    );
    const rows = await d1.all<{ food: string }>(
      "SELECT food FROM recipe_ingredients i JOIN recipes r ON r.id = i.recipe_id WHERE r.name = 'Gazpacho'",
    );
    expect(rows.map((x) => x.food)).toEqual(["tomate"]);
    const r = await d1.get<{ description: string | null; steps: number }>(
      "SELECT description, (SELECT count(*) FROM recipe_steps s WHERE s.recipe_id = r.id) AS steps FROM recipes r WHERE name = 'Gazpacho'",
    );
    expect(r).toEqual({ description: null, steps: 0 });
  });
});
