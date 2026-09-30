// Tiny async query/serialization helpers shared by route handlers (E1 repo.ts
// ported to D1). Routes may import this; only routes + env access touch the binding.

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

/** Load one recipe with ordered ingredients, 1..N numbered steps, material names
 *  and its macros per serving. */
export async function loadRecipe(
  db: D1Database,
  id: number,
): Promise<Row | null> {
  const head = await row(
    db,
    "SELECT id, name, description, servings, photo_path FROM recipes WHERE id = ?",
    id,
  );
  if (!head) return null;
  const ingredients = await rows(
    db,
    `SELECT ri.id, ri.food, ri.quantity, ri.unit, ri.section, ri.food_id, ri.optional,
            f.kcal, f.protein, f.fat, f.carbs, f.grams_per_unit
       FROM recipe_ingredients ri LEFT JOIN foods f ON f.id = ri.food_id
      WHERE ri.recipe_id = ? ORDER BY ri.position, ri.id`,
    id,
  );
  head.nutrition = nutritionPerServing(
    ingredients as IngredientMacros[],
    head.servings,
  );
  head.ingredients = ingredients.map((i) => ({
    id: i.id,
    food: i.food,
    quantity: i.quantity,
    unit: i.unit,
    section: i.section,
    foodId: i.food_id,
    optional: Boolean(i.optional),
  }));
  head.steps = (
    await rows(
      db,
      "SELECT id, position, text FROM recipe_steps WHERE recipe_id = ? ORDER BY position, id",
      id,
    )
  ).map((s, i) => ({ ...s, step: i + 1 }));
  head.materials = (
    await rows(
      db,
      "SELECT name FROM recipe_materials WHERE recipe_id = ? ORDER BY id",
      id,
    )
  ).map((m) => String(m.name));
  head.tags = (
    await rows(
      db,
      "SELECT tag FROM recipe_tags WHERE recipe_id = ? ORDER BY tag",
      id,
    )
  ).map((t) => String(t.tag));
  return head;
}

export async function loadExercise(
  db: D1Database,
  id: number,
): Promise<Row | null> {
  const head = await row(
    db,
    "SELECT id, name, description, setup_cues AS setupCues, technique_url AS techniqueUrl, steps, kind FROM exercises WHERE id = ?",
    id,
  );
  if (!head) return null;
  if (head.steps != null) head.steps = JSON.parse(String(head.steps));
  head.tags = (
    await rows(
      db,
      "SELECT tag FROM exercise_tags WHERE exercise_id = ? ORDER BY tag",
      id,
    )
  ).map((t) => String(t.tag));
  head.regions = (
    await rows(
      db,
      "SELECT region, role FROM exercise_regions WHERE exercise_id = ? ORDER BY region",
      id,
    )
  ).map((r) => ({ region: String(r.region), role: String(r.role) }));
  return head;
}

export async function loadTemplate(
  db: D1Database,
  id: number,
): Promise<Row | null> {
  const head = await row(
    db,
    "SELECT id, name FROM session_templates WHERE id = ?",
    id,
  );
  if (!head) return null;
  head.exercises = await rows(
    db,
    `SELECT te.id, te.exercise_id AS exerciseId, te.position,
            te.target_sets AS targetSets, te.target_reps_min AS targetRepsMin, te.target_reps_max AS targetRepsMax,
            te.target_distance_km AS targetDistanceKm, te.target_duration_min AS targetDurationMin,
            e.name AS exerciseName, e.kind AS kind
     FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id
     WHERE te.template_id = ? ORDER BY te.position, te.id`,
    id,
  );
  return head;
}
