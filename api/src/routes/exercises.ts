// /api/exercises — GET (?tag=) · POST · /:id GET/PUT/DELETE · /:id/last GET.
// last-values endpoint per E1 design D5.
import { Hono } from "hono";
import { type ExerciseInput, exerciseSchema } from "../api-validation";
import { type Env, getDb } from "../db";
import { fail, guard, json, parseId } from "../http";
import { listExercises, loadExercise, row } from "../repo";
import { zBody } from "../validation";

function tagStatements(
  name: string,
  tags: readonly string[],
  db: D1Database,
): D1PreparedStatement[] {
  return [...new Set(tags)].map((t) =>
    db
      .prepare(
        `INSERT INTO exercise_tags (exercise_id, tag) VALUES ((SELECT id FROM exercises WHERE name = ?), ?)`,
      )
      .bind(name, t),
  );
}

function regionStatements(
  name: string,
  regions: ExerciseInput["regions"],
  db: D1Database,
): D1PreparedStatement[] {
  return regions.map(({ region, role }) =>
    db
      .prepare(
        `INSERT INTO exercise_regions (exercise_id, region, role) VALUES ((SELECT id FROM exercises WHERE name = ?), ?, ?)`,
      )
      .bind(name, region, role),
  );
}

export const exercises = new Hono<{ Bindings: Env }>()
  .get("/", (c) =>
    guard(async () => {
      return json(await listExercises(getDb(c.env), c.req.query("tag")));
    }),
  )
  .post("/", zBody(exerciseSchema), (c) =>
    guard(async () => {
      const input = c.get("validated");
      const db = getDb(c.env);
      const name = input.name.trim();
      const results = await db.batch([
        db
          .prepare(
            "INSERT INTO exercises (name, description, setup_cues, technique_url, steps, kind) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(
            name,
            input.description ?? null,
            input.setupCues ?? null,
            input.techniqueUrl ?? null,
            input.steps ? JSON.stringify(input.steps) : null,
            input.kind,
          ),
        ...tagStatements(name, input.tags, db),
        ...regionStatements(name, input.regions, db),
      ]);
      return json(
        await loadExercise(db, Number(results[0].meta.last_row_id)),
        201,
      );
    }),
  )
  .get("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const ex = await loadExercise(c.env.DB, id);
      return ex ? json(ex) : fail("Not found", undefined, 404);
    }),
  )
  .put("/:id", zBody(exerciseSchema), (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const input = c.get("validated");
      const db = getDb(c.env);
      const existing = await row(
        db,
        "SELECT name FROM exercises WHERE id = ?",
        id,
      );
      if (!existing) return fail("Not found", undefined, 404);
      const name = input.name.trim();
      await db.batch([
        db
          .prepare(
            "UPDATE exercises SET name=?, description=?, setup_cues=?, technique_url=?, steps=?, kind=? WHERE id=?",
          )
          .bind(
            name,
            input.description ?? null,
            input.setupCues ?? null,
            input.techniqueUrl ?? null,
            input.steps ? JSON.stringify(input.steps) : null,
            input.kind,
            id,
          ),
        db.prepare("DELETE FROM exercise_tags WHERE exercise_id=?").bind(id),
        ...tagStatements(name, input.tags, db),
        db.prepare("DELETE FROM exercise_regions WHERE exercise_id=?").bind(id),
        ...regionStatements(name, input.regions, db),
      ]);
      return json(await loadExercise(db, id));
    }),
  )
  .delete("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const { meta } = await c.env.DB.prepare(
        "DELETE FROM exercises WHERE id=?",
      )
        .bind(id)
        .run();
      return Number(meta.changes) > 0
        ? new Response(null, { status: 204 })
        : fail("Not found", undefined, 404);
    }),
  )
  .get("/:id/last", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const db = getDb(c.env);
      if (!(await row(db, "SELECT id FROM exercises WHERE id = ?", id)))
        return fail("Not found", undefined, 404);
      // ?before=YYYY-MM-DD: solo lo registrado antes de esa fecha (registrar un día pasado).
      const before = c.req.query("before") ?? "9999-12-31";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(before))
        return fail("before must be YYYY-MM-DD", "before");
      const last = await row(
        db,
        `SELECT sl.weight_kg AS weightKg, sl.reps, wl.date
         FROM set_logs sl
         JOIN plan_session_exercises pse ON pse.id = sl.plan_session_exercise_id
         JOIN workout_logs wl ON wl.id = sl.workout_log_id
         WHERE pse.exercise_id = ? AND wl.date < ?
           AND (sl.weight_kg IS NOT NULL OR sl.reps IS NOT NULL)
         ORDER BY wl.date DESC, sl.id DESC
         LIMIT 1`,
        id,
        before,
      );
      return json({ exerciseId: id, last: last ?? null });
    }),
  );
