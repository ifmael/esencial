// /api/templates — GET · POST · /:id GET/PUT/DELETE. Una plantilla es una
// agrupación semántica de ejercicios (fuerza y/o cardio) con sus series/tiempos
// por defecto; no programa nada. PUT reemplaza las entradas ordenadas.
import { Hono } from "hono";
import { templateSchema } from "../api-validation";
import { type Env, getDb } from "../db";
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

// Ordered-entry INSERT builders (by-name subselect keeps POST atomic in one batch).
function entriesForNewTemplate(name: string, entries: Entry[], db: D1Database) {
  return entries.map((e, pos) =>
    db
      .prepare(
        `INSERT INTO template_exercises (template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_distance_km, target_duration_min)
         VALUES ((SELECT id FROM session_templates WHERE name = ?), ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        name,
        e.exerciseId,
        pos,
        e.targetSets ?? null,
        e.targetRepsMin ?? null,
        e.targetRepsMax ?? null,
        e.targetDistanceKm ?? null,
        e.targetDurationMin ?? null,
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
        `INSERT INTO template_exercises (template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_distance_km, target_duration_min)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ),
  );
}

export const templates = new Hono<{ Bindings: Env }>()
  .get("/", (c) =>
    guard(async () => {
      const db = getDb(c.env);
      const ids = await rows(
        db,
        "SELECT id FROM session_templates ORDER BY name COLLATE NOCASE",
      );
      return json(
        await Promise.all(ids.map((r) => loadTemplate(db, Number(r.id)))),
      );
    }),
  )
  .post("/", zBody(templateSchema), (c) =>
    guard(async () => {
      const input = c.get("validated");
      const db = getDb(c.env);
      if (hasDuplicateExercise(input.exercises))
        return fail("Ejercicio duplicado en la plantilla", "exercises");
      const name = input.name.trim();
      const results = await db.batch([
        db
          .prepare("INSERT INTO session_templates (name) VALUES (?)")
          .bind(name),
        ...entriesForNewTemplate(name, input.exercises, db),
      ]);
      return json(
        await loadTemplate(db, Number(results[0].meta.last_row_id)),
        201,
      );
    }),
  )
  .get("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const t = await loadTemplate(c.env.DB, id);
      return t ? json(t) : fail("Not found", undefined, 404);
    }),
  )
  .put("/:id", zBody(templateSchema), (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const input = c.get("validated");
      const db = getDb(c.env);
      if (!(await row(db, "SELECT id FROM session_templates WHERE id = ?", id)))
        return fail("Not found", undefined, 404);
      if (hasDuplicateExercise(input.exercises))
        return fail("Ejercicio duplicado en la plantilla", "exercises");
      await db.batch([
        db
          .prepare("UPDATE session_templates SET name = ? WHERE id = ?")
          .bind(input.name.trim(), id),
        db
          .prepare("DELETE FROM template_exercises WHERE template_id = ?")
          .bind(id),
        ...entriesForTemplate(id, input.exercises, db),
      ]);
      return json(await loadTemplate(db, id));
    }),
  )
  .delete("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const { meta } = await c.env.DB.prepare(
        "DELETE FROM session_templates WHERE id=?",
      )
        .bind(id)
        .run();
      return Number(meta.changes) > 0
        ? new Response(null, { status: 204 })
        : fail("Not found", undefined, 404);
    }),
  );
