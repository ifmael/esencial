// Tiny query/serialization helpers shared by route handlers.
// Routes may import this; only routes + lib/db.ts may import better-sqlite3.
import { getDb } from "@/lib/db";

export function rows(sql: string, ...args: unknown[]): Record<string, unknown>[] {
  return getDb().prepare(sql).all(...(args as never[])) as Record<string, unknown>[];
}

export function row(sql: string, ...args: unknown[]): Record<string, unknown> | undefined {
  return rows(sql, ...args)[0];
}

export function loadRecipe(id: number): Record<string, unknown> | null {
  const head = row("SELECT id, name, description, servings FROM recipes WHERE id = ?", id);
  if (!head) return null;
  head.ingredients = rows(
    "SELECT id, food, quantity, unit FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position, id",
    id,
  );
  head.steps = rows(
    "SELECT id, position, text FROM recipe_steps WHERE recipe_id = ? ORDER BY position, id",
    id,
  ).map((s, i) => ({ ...s, step: i + 1 }));
  head.materials = rows("SELECT name FROM recipe_materials WHERE recipe_id = ? ORDER BY id", id).map(
    (m) => String(m.name),
  );
  return head;
}

export function loadExercise(id: number): Record<string, unknown> | null {
  const head = row(
    "SELECT id, name, description, setup_cues AS setupCues, technique_url AS techniqueUrl FROM exercises WHERE id = ?",
    id,
  );
  if (!head) return null;
  head.tags = rows("SELECT tag FROM exercise_tags WHERE exercise_id = ? ORDER BY tag", id).map(
    (t) => String(t.tag),
  );
  return head;
}

export function loadTemplate(id: number): Record<string, unknown> | null {
  const head = row("SELECT id, name, rotation_index FROM session_templates WHERE id = ?", id);
  if (!head) return null;
  head.exercises = rows(
    `SELECT te.id, te.exercise_id AS exerciseId, te.position,
            te.target_sets, te.target_reps_min, te.target_reps_max,
            e.name AS exerciseName
     FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id
     WHERE te.template_id = ? ORDER BY te.position, te.id`,
    id,
  );
  return head;
}
