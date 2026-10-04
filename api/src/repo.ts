// Tiny async query/serialization helpers shared by route handlers (E1 repo.ts
// ported to D1). Routes may import this; only routes + env access touch the binding.
import type { User } from "./db";
import { normalizeEmail } from "./identity";

export type Row = Record<string, unknown>;

export async function rows(
  db: D1Database,
  sql: string,
  ...args: unknown[]
): Promise<Row[]> {
  const { results } = await db
    .prepare(sql)
    .bind(...(args as never[]))
    .all<Row>();
  return results ?? [];
}

export async function row(
  db: D1Database,
  sql: string,
  ...args: unknown[]
): Promise<Row | undefined> {
  return (await rows(db, sql, ...args))[0];
}

export type Nutrition = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  /** Algún ingrediente con cantidad no se pudo contar (sin alimento o sin conversión). */
  approximate: boolean;
};

type IngredientMacros = {
  quantity: unknown;
  unit: unknown;
  optional: unknown;
  kcal: unknown;
  protein: unknown;
  fat: unknown;
  carbs: unknown;
  grams_per_unit: unknown;
};

/** Gramos (o ml) por unidad de medida directa; «ud» va aparte (grams_per_unit). */
const GRAMS: Record<string, number> = { gr: 1, g: 1, ml: 1, kg: 1000, l: 1000 };

/** Macros por ración a partir de los ingredientes unidos a `foods` (valores
 *  por 100 g/ml). «ud» se convierte con grams_per_unit; lo opcional y lo que va
 *  sin cantidad («al gusto») no cuentan. Sin raciones, la receta es una. Si no
 *  se pudo contar nada, sale aproximada: «0 kcal» no es un dato. */
export function nutritionPerServing(
  ingredients: IngredientMacros[],
  servings: unknown,
): Nutrition {
  const sum = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  let approximate = false;
  let counted = 0;
  for (const i of ingredients) {
    if (i.optional || i.quantity === null) continue;
    const unit = String(i.unit ?? "");
    const grams =
      i.kcal === null
        ? null
        : unit in GRAMS
          ? Number(i.quantity) * GRAMS[unit]
          : unit === "ud" && i.grams_per_unit !== null
            ? Number(i.quantity) * Number(i.grams_per_unit)
            : null;
    if (grams === null) {
      approximate = true;
      continue;
    }
    counted += 1;
    for (const k of ["kcal", "protein", "fat", "carbs"] as const)
      sum[k] += (grams * Number(i[k])) / 100;
  }
  const n = Number(servings) || 1;
  return {
    kcal: Math.round(sum.kcal / n),
    protein: Math.round(sum.protein / n),
    fat: Math.round(sum.fat / n),
    carbs: Math.round(sum.carbs / n),
    approximate: approximate || counted === 0,
  };
}

/** Macros por ración de varias recetas en una sola consulta (una receta sin
 *  ingredientes sale a cero). */
export async function nutritionByRecipe(
  db: D1Database,
  ids: number[],
): Promise<Map<number, Nutrition>> {
  const unique = [...new Set(ids)];
  const out = new Map<number, Nutrition>();
  if (!unique.length) return out;
  const found = await rows(
    db,
    `SELECT r.id AS recipe_id, r.servings, ri.quantity, ri.unit, ri.optional,
            f.kcal, f.protein, f.fat, f.carbs, f.grams_per_unit
       FROM recipes r
       LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
       LEFT JOIN foods f ON f.id = ri.food_id
      WHERE r.id IN (${unique.map(() => "?").join(",")})`,
    ...unique,
  );
  for (const id of unique) {
    const mine = found.filter((x) => Number(x.recipe_id) === id);
    if (mine.length)
      out.set(
        id,
        nutritionPerServing(mine as IngredientMacros[], mine[0].servings),
      );
  }
  return out;
}

/** Suma de raciones (una por comida); null si no hay ninguna. */
export function sumNutrition(list: Nutrition[]): Nutrition | null {
  if (!list.length) return null;
  return list.reduce((a, b) => ({
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    carbs: a.carbs + b.carbs,
    approximate: a.approximate || b.approximate,
  }));
}

/** Agrupa filas por su padre, conservando el orden de la consulta. */
function byParent(list: Row[], key: string): Map<number, Row[]> {
  const out = new Map<number, Row[]>();
  for (const r of list) {
    const id = Number(r[key]);
    const group = out.get(id);
    if (group) group.push(r);
    else out.set(id, [r]);
  }
  return out;
}

/** Cabeceras filtradas por `where` y sus hijos: una consulta por tabla (no una
 *  por fila: en producción cada consulta es un viaje a D1) y todas en un solo
 *  batch. Cada consulta liga sus propios `args`; la lista va sin ninguno, porque
 *  D1 admite 100 por consulta y un IN con cada id rompería desde la fila 101. */
async function hydrate(
  db: D1Database,
  args: unknown[],
  head: string,
  children: string[],
): Promise<{ heads: Row[]; kids: Map<number, Row[]>[] }> {
  const [heads, ...kids] = await db.batch<Row>(
    [head, ...children].map((sql) =>
      db.prepare(sql).bind(...(args as never[])),
    ),
  );
  return {
    heads: heads.results ?? [],
    kids: kids.map((k) => byParent(k.results ?? [], "parent")),
  };
}

/** Recetas con sus ingredientes en orden, pasos numerados 1..N, materiales,
 *  tags y macros por ración. `where` filtra `recipes r`. */
async function queryRecipes(
  db: D1Database,
  where = "",
  ...args: unknown[]
): Promise<Row[]> {
  const mine = `recipe_id IN (SELECT r.id FROM recipes r ${where})`;
  const {
    heads,
    kids: [ingredients, steps, materials, tags],
  } = await hydrate(
    db,
    args,
    `SELECT r.id, r.name, r.description, r.servings, r.photo_path, r.owner_id AS ownerId FROM recipes r ${where} ORDER BY r.name COLLATE NOCASE`,
    [
      `SELECT ri.recipe_id AS parent, ri.id, ri.food, ri.quantity, ri.unit, ri.section, ri.food_id, ri.optional,
              f.kcal, f.protein, f.fat, f.carbs, f.grams_per_unit
         FROM recipe_ingredients ri LEFT JOIN foods f ON f.id = ri.food_id
        WHERE ri.${mine} ORDER BY ri.recipe_id, ri.position, ri.id`,
      `SELECT recipe_id AS parent, id, position, text FROM recipe_steps WHERE ${mine} ORDER BY recipe_id, position, id`,
      `SELECT recipe_id AS parent, name FROM recipe_materials WHERE ${mine} ORDER BY recipe_id, id`,
      `SELECT recipe_id AS parent, tag FROM recipe_tags WHERE ${mine} ORDER BY recipe_id, tag`,
    ],
  );
  return heads.map((h) => {
    const id = Number(h.id);
    const mineOf = (m: Map<number, Row[]>) => m.get(id) ?? [];
    const ings = mineOf(ingredients);
    return {
      ...h,
      nutrition: nutritionPerServing(ings as IngredientMacros[], h.servings),
      ingredients: ings.map((i) => ({
        id: i.id,
        food: i.food,
        quantity: i.quantity,
        unit: i.unit,
        section: i.section,
        foodId: i.food_id,
        optional: Boolean(i.optional),
      })),
      steps: mineOf(steps).map((s, i) => ({
        id: s.id,
        position: s.position,
        text: s.text,
        step: i + 1,
      })),
      materials: mineOf(materials).map((m) => String(m.name)),
      tags: mineOf(tags).map((t) => String(t.tag)),
    };
  });
}

/** Quien mira: las recetas de su familia son suyas de ida y vuelta. */
export type RecipeView = { userId: number; familyId: number };

/** ¿Alguna receta que este usuario puede leer usa esta key de subida? Hace
 *  falta además de la propiedad: la foto se sube ANTES de que exista la receta,
 *  así que las del catálogo apuntan a keys que subió el admin. */
export async function uploadUsedByReadableRecipe(
  db: D1Database,
  key: string,
  view: RecipeView,
): Promise<boolean> {
  const found = await row(
    db,
    `SELECT 1 AS ok FROM recipes r WHERE r.photo_path = ? AND ${RECIPE_VISIBLE}`,
    key,
    view.userId,
    view.familyId,
  );
  return Boolean(found);
}

/** Usuario de una subida, o null si no está registrada. */
export async function uploadOwner(
  db: D1Database,
  key: string,
): Promise<number | null> {
  const found = await row(
    db,
    "SELECT owner_user_id AS ownerId FROM uploads WHERE key = ?",
    key,
  );
  return found ? Number(found.ownerId) : null;
}

/** Solo id y nombre de lo que puede ver (la búsqueda ⌘K): una consulta y unos
 *  KB, no la lista hidratada (~337 KB). */
export async function listRecipeNames(
  db: D1Database,
  view: RecipeView,
): Promise<Row[]> {
  return await rows(
    db,
    `SELECT r.id, r.name FROM recipes r WHERE ${RECIPE_VISIBLE} ORDER BY r.name COLLATE NOCASE`,
    view.userId,
    view.familyId,
  );
}

/** Recetas legibles: el catálogo (owner_id NULL), las mías y las de mi familia.
 *  La pertenencia a la familia es derivada (`users.family_id`), no hay columna
 *  de familia en recipes: por eso consultar la receta de un hermano es gratis. */
const RECIPE_VISIBLE = `(r.owner_id IS NULL OR r.owner_id = ?
   OR r.owner_id IN (SELECT u.id FROM users u WHERE u.family_id = ?))`;

export const listRecipes = (db: D1Database, view: RecipeView) =>
  queryRecipes(db, `WHERE ${RECIPE_VISIBLE}`, view.userId, view.familyId);

export async function loadRecipe(
  db: D1Database,
  id: number,
  view: RecipeView,
): Promise<Row | null> {
  return (
    (
      await queryRecipes(
        db,
        `WHERE r.id = ? AND ${RECIPE_VISIBLE}`,
        id,
        view.userId,
        view.familyId,
      )
    )[0] ?? null
  );
}

/** Ejercicios con sus tags y sus regiones (con grado). `where` filtra
 *  `exercises e`. */
async function queryExercises(
  db: D1Database,
  where = "",
  ...args: unknown[]
): Promise<Row[]> {
  const mine = `exercise_id IN (SELECT e.id FROM exercises e ${where})`;
  const {
    heads,
    kids: [tags, regions, aliases],
  } = await hydrate(
    db,
    args,
    `SELECT e.id, e.name, e.description, e.setup_cues AS setupCues, e.technique_url AS techniqueUrl, e.steps, e.kind FROM exercises e ${where} ORDER BY e.name COLLATE NOCASE`,
    [
      `SELECT exercise_id AS parent, tag FROM exercise_tags WHERE ${mine} ORDER BY exercise_id, tag`,
      `SELECT exercise_id AS parent, region, role FROM exercise_regions WHERE ${mine} ORDER BY exercise_id, region`,
      `SELECT exercise_id AS parent, alias FROM exercise_aliases WHERE ${mine} ORDER BY exercise_id, alias`,
    ],
  );
  return heads.map((h) => {
    const id = Number(h.id);
    return {
      ...h,
      steps: h.steps == null ? h.steps : JSON.parse(String(h.steps)),
      tags: (tags.get(id) ?? []).map((t) => String(t.tag)),
      regions: (regions.get(id) ?? []).map((r) => ({
        region: String(r.region),
        role: String(r.role),
      })),
      aliases: (aliases.get(id) ?? []).map((a) => String(a.alias)),
    };
  });
}

export const listExercises = (db: D1Database, tag?: string) =>
  tag
    ? queryExercises(
        db,
        "WHERE e.id IN (SELECT exercise_id FROM exercise_tags WHERE tag = ?)",
        tag,
      )
    : queryExercises(db);

export async function loadExercise(
  db: D1Database,
  id: number,
): Promise<Row | null> {
  return (await queryExercises(db, "WHERE e.id = ?", id))[0] ?? null;
}

export async function loadTemplate(
  db: D1Database,
  id: number,
  userId: number,
): Promise<Row | null> {
  const head = await row(
    db,
    "SELECT id, name FROM session_templates WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  if (!head) return null;
  head.exercises = await rows(
    db,
    `SELECT te.id, te.exercise_id AS exerciseId, te.position,
            te.target_sets AS targetSets, te.target_reps_min AS targetRepsMin, te.target_reps_max AS targetRepsMax,
            te.target_distance_km AS targetDistanceKm, te.target_duration_min AS targetDurationMin,
            te.rest_secs AS restSecs, te.rest_after_secs AS restAfterSecs,
            e.name AS exerciseName, e.kind AS kind
     FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id
     WHERE te.template_id = ? ORDER BY te.position, te.id`,
    id,
  );
  return head;
}

/** Autoprovisión multi-usuario: la primera petición autenticada de un email
 *  estrena su cuenta con familia de uno. El admin se designa por ADMIN_EMAIL y,
 *  si no hay ninguno, cae en el primer usuario. Idempotente: el email es UNIQUE
 *  y, si dos peticiones llegan a la vez, la que pierde relee al ganador en vez
 *  de reventar (su familia recién creada no queda huérfana). El email llega ya
 *  normalizado (identity.ts), así que aquí es la clave de búsqueda tal cual. */
export async function ensureUser(
  db: D1Database,
  email: string,
  adminEmail?: string,
): Promise<User> {
  const existing = await row(
    db,
    "SELECT id, email, role, name, family_id FROM users WHERE email = ?",
    email,
  );
  if (existing) return existing as unknown as User;

  const total = await row(db, "SELECT COUNT(*) AS n FROM users");
  const role =
    Number(total?.n ?? 0) === 0 || normalizeEmail(adminEmail) === email
      ? "admin"
      : "member";

  const family = await db
    .prepare("INSERT INTO families (name) VALUES (?)")
    .bind(email)
    .run();
  const familyId = Number(family.meta.last_row_id);

  try {
    const created = await db
      .prepare("INSERT INTO users (email, role, family_id) VALUES (?, ?, ?)")
      .bind(email, role, familyId)
      .run();
    return {
      id: Number(created.meta.last_row_id),
      email,
      role,
      name: null,
      family_id: familyId,
    };
  } catch (err) {
    await db.prepare("DELETE FROM families WHERE id = ?").bind(familyId).run();
    const winner = await row(
      db,
      "SELECT id, email, role, name, family_id FROM users WHERE email = ?",
      email,
    );
    if (winner) return winner as unknown as User;
    throw err;
  }
}
