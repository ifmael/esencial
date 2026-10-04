// /api/recipes — GET list · POST create (nested children) · /:id GET/PUT/DELETE.
// PUT replaces children wholesale; DELETE clears meal_slots then cascades (E1 parity).
import { Hono } from "hono";
import { recipeSchema } from "../api-validation";
import { type AppContext, type Env, getDb, type User } from "../db";
import { fail, guard, json, parseId } from "../http";
import { listRecipeNames, listRecipes, loadRecipe, row, rows } from "../repo";
import { zBody } from "../validation";

// Name is UNIQUE, so children can resolve the parent id inside one atomic batch.
const RECIPE_ID = "(SELECT id FROM recipes WHERE name = ?)";

// Fail-closed (spec UPLOAD/RECIPE_CREATE): solo photo_path devueltos por
// POST /api/uploads (key R2 recipe-<uuid>.<ext> existente en PHOTOS).
const PHOTO_KEY = /^recipe-[0-9a-f-]{36}\.(png|jpe?g|webp)$/;

async function validPhoto(
  env: Env,
  photo_path: string | null | undefined,
): Promise<boolean> {
  if (!photo_path) return true; // ausente/null es válido (receta sin foto)
  if (!PHOTO_KEY.test(photo_path)) return false;
  return (await env.PHOTOS.head(photo_path)) !== null;
}

/** Índice del primer ingrediente cuyo foodId no está en el catálogo (o null). */
async function unknownFood(
  db: D1Database,
  ingredients: { foodId?: number | null }[],
): Promise<number | null> {
  const ids = [...new Set(ingredients.flatMap((i) => i.foodId ?? []))];
  if (!ids.length) return null;
  const known = new Set(
    (
      await rows(
        db,
        `SELECT id FROM foods WHERE id IN (${ids.map(() => "?").join(",")})`,
        ...ids,
      )
    ).map((r) => Number(r.id)),
  );
  const i = ingredients.findIndex((x) => x.foodId && !known.has(x.foodId));
  return i === -1 ? null : i;
}

function childStatements(
  name: string,
  input: {
    ingredients: {
      food: string;
      quantity?: number | null;
      unit?: string | null;
      section?: string | null;
      foodId?: number | null;
      optional?: boolean;
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
          `INSERT INTO recipe_ingredients (recipe_id, position, food, quantity, unit, section, food_id, optional) VALUES (${RECIPE_ID}, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          name,
          pos,
          i.food,
          i.quantity ?? null,
          i.unit ?? null,
          i.section ?? null,
          i.foodId ?? null,
          i.optional ? 1 : 0,
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

/** Fila de una receta que este usuario PUEDE escribir, o la respuesta que hay
 *  que devolver: 404 si no existe o no la puede ver (la receta de otra familia
 *  es indistinguible de no existir) y 403 si la ve pero no la escribe —el
 *  catálogo es del admin—. */
async function writableRecipe(
  db: D1Database,
  id: number,
  user: User,
): Promise<{ photo_path: unknown } | Response> {
  const found = await row(
    db,
    `SELECT r.photo_path, r.owner_id AS ownerId, u.family_id AS ownerFamily
       FROM recipes r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?`,
    id,
  );
  if (!found) return fail("Not found", undefined, 404);
  if (found.ownerId === null)
    return user.role === "admin"
      ? { photo_path: found.photo_path }
      : json({ error: "Forbidden" }, 403);
  const mine = Number(found.ownerId) === user.id;
  const sameFamily = Number(found.ownerFamily) === user.family_id;
  if (!mine && !sameFamily) return fail("Not found", undefined, 404);
  return { photo_path: found.photo_path };
}

export const recipes = new Hono<AppContext>()
  .get("/", (c) =>
    guard(async () => {
      const db = getDb(c.env);
      const user = c.get("user");
      const view = { userId: user.id, familyId: user.family_id };
      if (c.req.query("summary")) return json(await listRecipeNames(db, view));
      return json(await listRecipes(db, view));
    }),
  )
  .post("/", zBody(recipeSchema), (c) =>
    guard(async () => {
      const input = c.get("validated");
      const user = c.get("user");
      if (!input.name.trim()) return fail("Recipe name is required", "name");
      if (!(await validPhoto(c.env, input.photo_path)))
        return fail(
          "photo_path no corresponde a una foto subida",
          "photo_path",
        );
      const db = getDb(c.env);
      const bad = await unknownFood(db, input.ingredients);
      if (bad !== null)
        return fail(
          "foodId no está en el catálogo",
          `ingredients.${bad}.foodId`,
        );
      const name = input.name.trim();
      const results = await db.batch([
        db
          .prepare(
            "INSERT INTO recipes (name, description, servings, photo_path, owner_id) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(
            name,
            input.description ?? null,
            input.servings ?? null,
            input.photo_path ?? null,
            user.id,
          ),
        ...childStatements(name, input, db),
      ]);
      const id = Number(results[0].meta.last_row_id);
      return json(
        await loadRecipe(db, id, { userId: user.id, familyId: user.family_id }),
        201,
      );
    }),
  )
  .get("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const user = c.get("user");
      const recipe = await loadRecipe(c.env.DB, id, {
        userId: user.id,
        familyId: user.family_id,
      });
      return recipe ? json(recipe) : fail("Not found", undefined, 404);
    }),
  )
  .put("/:id", zBody(recipeSchema), (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      const input = c.get("validated");
      const user = c.get("user");
      if (id === null) return fail("id must be a positive integer", "id");
      if (!input.name.trim()) return fail("Recipe name is required", "name");
      const db = getDb(c.env);
      const current = await writableRecipe(db, id, user);
      if (current instanceof Response) return current;
      // La key ya guardada no se revalida: las recetas sembradas (0012) apuntan
      // a fotos que solo existen tras subirlas a mano a R2.
      if (
        (input.photo_path ?? null) !== current.photo_path &&
        !(await validPhoto(c.env, input.photo_path))
      )
        return fail(
          "photo_path no corresponde a una foto subida",
          "photo_path",
        );
      const bad = await unknownFood(db, input.ingredients);
      if (bad !== null)
        return fail(
          "foodId no está en el catálogo",
          `ingredients.${bad}.foodId`,
        );
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
                "INSERT INTO recipe_ingredients (recipe_id, position, food, quantity, unit, section, food_id, optional) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              )
              .bind(
                id,
                pos,
                i.food,
                i.quantity ?? null,
                i.unit ?? null,
                i.section ?? null,
                i.foodId ?? null,
                i.optional ? 1 : 0,
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
      return json(
        await loadRecipe(db, id, { userId: user.id, familyId: user.family_id }),
      );
    }),
  )
  .delete("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const current = await writableRecipe(c.env.DB, id, c.get("user"));
      if (current instanceof Response) return current;
      // Slots keep existing but read empty after the recipe dies (E1: RESTRICT + manual clear in one batch).
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE meal_slots SET recipe_id = NULL WHERE recipe_id = ?",
        ).bind(id),
        c.env.DB.prepare("DELETE FROM recipes WHERE id=?").bind(id),
      ]);
      return new Response(null, { status: 204 });
    }),
  );
