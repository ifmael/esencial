// /api/recipes — GET list · POST create (nested children) · /:id GET/PUT/DELETE.
// PUT replaces children wholesale; DELETE clears meal_slots then cascades (E1 parity).
import { Hono } from "hono";
import { recipeSchema } from "../api-validation";
import { type Env, getDb } from "../db";
import { fail, guard, json, parseId } from "../http";
import { loadRecipe, row, rows } from "../repo";
import { zBody } from "../validation";

// Name is UNIQUE, so children can resolve the parent id inside one atomic batch.
const RECIPE_ID = "(SELECT id FROM recipes WHERE name = ?)";

function childStatements(
  name: string,
  input: {
    ingredients: {
      food: string;
      quantity?: number | null;
      unit?: string | null;
      section?: string | null;
    }[];
    steps: string[];
    materials: string[];
    tags: string[];
  },
  db: D1Database,
): D1PreparedStatement[] {
  return [
    ...input.ingredients.map((i, pos) =>
      db
        .prepare(
          `INSERT INTO recipe_ingredients (recipe_id, position, food, quantity, unit, section) VALUES (${RECIPE_ID}, ?, ?, ?, ?, ?)`,
        )
        .bind(
          name,
          pos,
          i.food,
          i.quantity ?? null,
          i.unit ?? null,
          i.section ?? null,
        ),
    ),
    ...input.steps.map((text, pos) =>
      db
        .prepare(
          `INSERT INTO recipe_steps (recipe_id, position, text) VALUES (${RECIPE_ID}, ?, ?)`,
        )
        .bind(name, pos, text),
    ),
    ...input.materials.map((mat) =>
      db
        .prepare(
          `INSERT INTO recipe_materials (recipe_id, name) VALUES (${RECIPE_ID}, ?)`,
        )
        .bind(name, mat),
    ),
    ...input.tags.map((tag) =>
      db
        .prepare(
          `INSERT INTO recipe_tags (recipe_id, tag) VALUES (${RECIPE_ID}, ?)`,
        )
        .bind(name, tag),
    ),
  ];
}

export const recipes = new Hono<{ Bindings: Env }>()
  .get("/", (c) =>
    guard(async () => {
      const db = getDb(c.env);
      const ids = await rows(
        db,
        "SELECT id FROM recipes ORDER BY name COLLATE NOCASE",
      );
      const list = await Promise.all(
        ids.map((r) => loadRecipe(db, Number(r.id))),
      );
      return json(list);
    }),
  )
  .post("/", zBody(recipeSchema), (c) =>
    guard(async () => {
      const input = c.get("validated");
      if (!input.name.trim()) return fail("Recipe name is required", "name");
      const db = getDb(c.env);
      const name = input.name.trim();
      const results = await db.batch([
        db
          .prepare(
            "INSERT INTO recipes (name, description, servings, photo_path) VALUES (?, ?, ?, ?)",
          )
          .bind(
            name,
            input.description ?? null,
            input.servings ?? null,
            input.photo_path ?? null,
          ),
        ...childStatements(name, input, db),
      ]);
      const id = Number(results[0].meta.last_row_id);
      return json(await loadRecipe(db, id), 201);
    }),
  )
  .get("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const recipe = await loadRecipe(c.env.DB, id);
      return recipe ? json(recipe) : fail("Not found", undefined, 404);
    }),
  )
  .put("/:id", zBody(recipeSchema), (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const input = c.get("validated");
      if (!input.name.trim()) return fail("Recipe name is required", "name");
      const db = getDb(c.env);
      if (!(await row(db, "SELECT id FROM recipes WHERE id = ?", id)))
        return fail("Not found", undefined, 404);
      const name = input.name.trim();
      await db.batch([
        db
          .prepare(
            "UPDATE recipes SET name=?, description=?, servings=?, photo_path=? WHERE id=?",
          )
          .bind(
            name,
            input.description ?? null,
            input.servings ?? null,
            input.photo_path ?? null,
            id,
          ),
        db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id=?").bind(id),
        db.prepare("DELETE FROM recipe_steps WHERE recipe_id=?").bind(id),
        db.prepare("DELETE FROM recipe_materials WHERE recipe_id=?").bind(id),
        db.prepare("DELETE FROM recipe_tags WHERE recipe_id=?").bind(id),
        ...[
          ...input.ingredients.map((i, pos) =>
            db
              .prepare(
                "INSERT INTO recipe_ingredients (recipe_id, position, food, quantity, unit, section) VALUES (?, ?, ?, ?, ?, ?)",
              )
              .bind(
                id,
                pos,
                i.food,
                i.quantity ?? null,
                i.unit ?? null,
                i.section ?? null,
              ),
          ),
          ...input.steps.map((text, pos) =>
            db
              .prepare(
                "INSERT INTO recipe_steps (recipe_id, position, text) VALUES (?, ?, ?)",
              )
              .bind(id, pos, text),
          ),
          ...input.materials.map((mat) =>
            db
              .prepare(
                "INSERT INTO recipe_materials (recipe_id, name) VALUES (?, ?)",
              )
              .bind(id, mat),
          ),
          ...input.tags.map((tag) =>
            db
              .prepare("INSERT INTO recipe_tags (recipe_id, tag) VALUES (?, ?)")
              .bind(id, tag),
          ),
        ],
      ]);
      return json(await loadRecipe(db, id));
    }),
  )
  .delete("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      // Slots keep existing but read empty after the recipe dies (E1: RESTRICT + manual clear in one batch).
      const results = await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE meal_slots SET recipe_id = NULL WHERE recipe_id = ?",
        ).bind(id),
        c.env.DB.prepare("DELETE FROM recipes WHERE id=?").bind(id),
      ]);
      return Number(results[1].meta.changes) > 0
        ? new Response(null, { status: 204 })
        : fail("Not found", undefined, 404);
    }),
  );
