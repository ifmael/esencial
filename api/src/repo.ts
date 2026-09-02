// Tiny async query/serialization helpers shared by route handlers (E1 repo.ts
// ported to D1). Routes may import this; only routes + env access touch the binding.

export type Row = Record<string, unknown>;

export async function rows(db: D1Database, sql: string, ...args: unknown[]): Promise<Row[]> {
  const { results } = await db.prepare(sql).bind(...(args as never[])).all<Row>();
  return results ?? [];
}

export async function row(db: D1Database, sql: string, ...args: unknown[]): Promise<Row | undefined> {
  return (await rows(db, sql, ...args))[0];
}

/** Load one recipe with ordered ingredients, 1..N numbered steps, material names. */
export async function loadRecipe(db: D1Database, id: number): Promise<Row | null> {
  const head = await row(
    db,
    "SELECT id, name, description, servings, photo_path FROM recipes WHERE id = ?",
    id,
  );
  if (!head) return null;
  head.ingredients = await rows(
    db,
    "SELECT id, food, quantity, unit, section FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position, id",
    id,
  );
  head.steps = (
    await rows(
      db,
      "SELECT id, position, text FROM recipe_steps WHERE recipe_id = ? ORDER BY position, id",
      id,
    )
  ).map((s, i) => ({ ...s, step: i + 1 }));
  head.materials = (
    await rows(db, "SELECT name FROM recipe_materials WHERE recipe_id = ? ORDER BY id", id)
  ).map((m) => String(m.name));
  head.tags = (
    await rows(db, "SELECT tag FROM recipe_tags WHERE recipe_id = ? ORDER BY tag", id)
  ).map((t) => String(t.tag));
  return head;
}

export async function loadExercise(db: D1Database, id: number): Promise<Row | null> {
  const head = await row(
    db,
    "SELECT id, name, description, setup_cues AS setupCues, technique_url AS techniqueUrl FROM exercises WHERE id = ?",
    id,
  );
  if (!head) return null;
  head.tags = (
    await rows(db, "SELECT tag FROM exercise_tags WHERE exercise_id = ? ORDER BY tag", id)
  ).map((t) => String(t.tag));
  return head;
}

export async function loadTemplate(db: D1Database, id: number): Promise<Row | null> {
  const head = await row(
    db,
    "SELECT id, name, rotation_index FROM session_templates WHERE id = ?",
    id,
  );
  if (!head) return null;
  head.exercises = await rows(
    db,
    `SELECT te.id, te.exercise_id AS exerciseId, te.position,
            te.target_sets, te.target_reps_min, te.target_reps_max,
            e.name AS exerciseName
     FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id
     WHERE te.template_id = ? ORDER BY te.position, te.id`,
    id,
  );
  return head;
}
