// /api/recipes/[id] — GET/PUT/DELETE (children replaced wholesale on PUT;
// CASCADE deletes children on DELETE).
import { getDb } from "@/lib/db";
import { guard, json, fail, readValidated, parseId } from "@/lib/api";
import { recipeSchema } from "@/lib/api-validation";
import { loadRecipe } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const id = parseId((await ctx.params).id);
    if (id === null) return fail("id must be a positive integer", "id");
    const recipe = loadRecipe(id);
    return recipe ? json(recipe) : fail("Not found", undefined, 404);
  });
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const id = parseId((await ctx.params).id);
    if (id === null) return fail("id must be a positive integer", "id");
    const parsed = await readValidated(req, recipeSchema);
    if (!parsed.ok) return parsed.res;
    const input = parsed.data;
    if (!input.name.trim()) return fail("Recipe name is required", "name");
    const db = getDb();
    const tx = db.transaction(() => {
      const { changes } = db
        .prepare("UPDATE recipes SET name=?, description=?, servings=? WHERE id=?")
        .run(input.name.trim(), input.description ?? null, input.servings ?? null, id);
      if (changes === 0) return false;
      db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id=?").run(id);
      db.prepare("DELETE FROM recipe_steps WHERE recipe_id=?").run(id);
      db.prepare("DELETE FROM recipe_materials WHERE recipe_id=?").run(id);
      const ing = db.prepare(
        "INSERT INTO recipe_ingredients (recipe_id, position, food, quantity, unit) VALUES (?, ?, ?, ?, ?)",
      );
      input.ingredients.forEach((i, pos) => ing.run(id, pos, i.food, i.quantity ?? null, i.unit ?? null));
      const step = db.prepare("INSERT INTO recipe_steps (recipe_id, position, text) VALUES (?, ?, ?)");
      input.steps.forEach((text, pos) => step.run(id, pos, text));
      const mat = db.prepare("INSERT INTO recipe_materials (recipe_id, name) VALUES (?, ?)");
      input.materials.forEach((name) => mat.run(id, name));
      return true;
    });
    if (!tx()) return fail("Not found", undefined, 404);
    return json(loadRecipe(id));
  });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const id = parseId((await ctx.params).id);
    if (id === null) return fail("id must be a positive integer", "id");
    // Slots keep existing but read empty after the recipe dies (tasks 5.1:
    // RESTRICT + manual clear in the same transaction).
    const db = getDb();
    const changes = db.transaction(() => {
      db.prepare("UPDATE meal_slots SET recipe_id = NULL WHERE recipe_id = ?").run(id);
      return db.prepare("DELETE FROM recipes WHERE id=?").run(id).changes;
    })();
    return changes > 0 ? new Response(null, { status: 204 }) : fail("Not found", undefined, 404);
  });
}
