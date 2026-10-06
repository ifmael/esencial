// /api/templates — GET · POST · /:id GET/PUT/DELETE. Una plantilla es una
// agrupación semántica de ejercicios (fuerza y/o cardio) con sus series/tiempos
// por defecto; no programa nada. PUT reemplaza las entradas ordenadas.
import { Hono } from "hono";
import { templateSchema } from "../api-validation";
import { blockError } from "../blocks";
import { type AppContext, getDb } from "../db";
import { fail, guard, json, parseId } from "../http";
import { loadTemplate, row, rows } from "../repo";
import { zBody } from "../validation";

type Entry = {
  exerciseId: number;
  targetSets?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDistanceKm?: number | null;
  targetDurationMin?: number | null;
  restSecs?: number | null;
  restAfterSecs?: number | null;
  /** `true` = va pegado a la entrada siguiente (bloque/superserie). */
  superset?: boolean;
};

/** Un ejercicio no puede repetirse dentro de la plantilla (mismo criterio que el día). */
function hasDuplicateExercise(entries: Entry[]): boolean {
  const seen = new Set<number>();
  for (const e of entries) {
    if (seen.has(e.exerciseId)) return true;
    seen.add(e.exerciseId);
  }
  return false;
}

/** Duplicados y bloques mal formados son 400 en `exercises`. */
async function exercisesError(
  db: D1Database,
  entries: Entry[],
): Promise<string | null> {
  if (hasDuplicateExercise(entries))
    return "Ejercicio duplicado en la plantilla";
  if (entries.length === 0) return null;
  const marks = entries.map(() => "?").join(",");
  const found = await rows(
    db,
    `SELECT id, kind FROM exercises WHERE id IN (${marks})`,
    ...entries.map((e) => e.exerciseId),
  );
  return blockError(
    entries,
    found.map((r) => ({ id: Number(r.id), kind: String(r.kind) })),
  );
}

// Ordered-entry INSERT builders (by-name subselect keeps POST atomic in one batch).
function entriesForNewTemplate(
  name: string,
  entries: Entry[],
  db: D1Database,
  userId: number,
) {
  return entries.map((e, pos) =>
    db
      .prepare(
        `INSERT INTO template_exercises (template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_distance_km, target_duration_min, rest_secs, rest_after_secs, superset)
         VALUES ((SELECT id FROM session_templates WHERE name = ? AND user_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        name,
        userId,
        e.exerciseId,
        pos,
        e.targetSets ?? null,
        e.targetRepsMin ?? null,
        e.targetRepsMax ?? null,
        e.targetDistanceKm ?? null,
        e.targetDurationMin ?? null,
        e.restSecs ?? null,
        e.restAfterSecs ?? null,
        e.superset ? 1 : 0,
      ),
  );
}

function entriesForTemplate(
  templateId: number,
  entries: Entry[],
  db: D1Database,
) {
  return entries.map((e, pos) =>
    db
      .prepare(
        `INSERT INTO template_exercises (template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_distance_km, target_duration_min, rest_secs, rest_after_secs, superset)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        templateId,
        e.exerciseId,
        pos,
        e.targetSets ?? null,
        e.targetRepsMin ?? null,
        e.targetRepsMax ?? null,
        e.targetDistanceKm ?? null,
        e.targetDurationMin ?? null,
        e.restSecs ?? null,
        e.restAfterSecs ?? null,
        e.superset ? 1 : 0,
      ),
  );
}

export const templates = new Hono<AppContext>()
  .get("/", (c) =>
    guard(async () => {
      const db = getDb(c.env);
      const user = c.get("user");
      const ids = await rows(
        db,
        "SELECT id FROM session_templates WHERE user_id = ? ORDER BY name COLLATE NOCASE",
        user.id,
      );
      return json(
        await Promise.all(
          ids.map((r) => loadTemplate(db, Number(r.id), user.id)),
        ),
      );
    }),
  )
  .post("/", zBody(templateSchema), (c) =>
    guard(async () => {
      const input = c.get("validated");
      const db = getDb(c.env);
      const user = c.get("user");
      const problem = await exercisesError(db, input.exercises);
      if (problem) return fail(problem, "exercises");
      const name = input.name.trim();
      const results = await db.batch([
        db
          .prepare(
            "INSERT INTO session_templates (name, user_id) VALUES (?, ?)",
          )
          .bind(name, user.id),
        ...entriesForNewTemplate(name, input.exercises, db, user.id),
      ]);
      return json(
        await loadTemplate(db, Number(results[0].meta.last_row_id), user.id),
        201,
      );
    }),
  )
  .get("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const t = await loadTemplate(c.env.DB, id, c.get("user").id);
      return t ? json(t) : fail("Not found", undefined, 404);
    }),
  )
  .put("/:id", zBody(templateSchema), (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const input = c.get("validated");
      const db = getDb(c.env);
      const user = c.get("user");
      if (
        !(await row(
          db,
          "SELECT id FROM session_templates WHERE id = ? AND user_id = ?",
          id,
          user.id,
        ))
      )
        return fail("Not found", undefined, 404);
      const problem = await exercisesError(db, input.exercises);
      if (problem) return fail(problem, "exercises");
      await db.batch([
        db
          .prepare(
            "UPDATE session_templates SET name = ? WHERE id = ? AND user_id = ?",
          )
          .bind(input.name.trim(), id, user.id),
        db
          .prepare("DELETE FROM template_exercises WHERE template_id = ?")
          .bind(id),
        ...entriesForTemplate(id, input.exercises, db),
      ]);
      return json(await loadTemplate(db, id, user.id));
    }),
  )
  .delete("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const { meta } = await c.env.DB.prepare(
        "DELETE FROM session_templates WHERE id=? AND user_id=?",
      )
        .bind(id, c.get("user").id)
        .run();
      return Number(meta.changes) > 0
        ? new Response(null, { status: 204 })
        : fail("Not found", undefined, 404);
    }),
  );
