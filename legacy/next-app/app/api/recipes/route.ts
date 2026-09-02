// GET /api/recipes — list. POST /api/recipes — create with nested children.
import { getDb } from "@/lib/db";
import { guard, json, readValidated, fail } from "@/lib/api";
import { recipeSchema } from "@/lib/api-validation";
import { loadRecipe, rows } from "@/lib/repo";

export async function GET(): Promise<Response> {
  return guard(async () => {
    const ids = rows("SELECT id FROM recipes ORDER BY name COLLATE NOCASE");
    return json(ids.map((r) => loadRecipe(Number(r.id))));
  });
}

export async function POST(req: Request): Promise<Response> {
  return guard(async () => {
    const parsed = await readValidated(req, recipeSchema);
    if (!parsed.ok) return parsed.res;
    const input = parsed.data;
    if (!input.name.trim()) return fail("Recipe name is required", "name");
    const db = getDb();
    const tx = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare("INSERT INTO recipes (name, description, servings) VALUES (?, ?, ?)")
        .run(input.name.trim(), input.description ?? null, input.servings ?? null);
      const id = Number(lastInsertRowid);
      const ing = db.prepare(
        "INSERT INTO recipe_ingredients (recipe_id, position, food, quantity, unit) VALUES (?, ?, ?, ?, ?)",
      );
      input.ingredients.forEach((i, pos) => ing.run(id, pos, i.food, i.quantity ?? null, i.unit ?? null));
      const step = db.prepare("INSERT INTO recipe_steps (recipe_id, position, text) VALUES (?, ?, ?)");
      input.steps.forEach((text, pos) => step.run(id, pos, text));
      const mat = db.prepare("INSERT INTO recipe_materials (recipe_id, name) VALUES (?, ?)");
      input.materials.forEach((name) => mat.run(id, name));
      return id;
    });
    return json(loadRecipe(tx()), 201);
  });
}
