// /api/workout-logs/:date — POST "Cerrar sesión": persists the log + sets and
// flips the plan session to logged in one batch. A logged day is read-only:
// a second POST gets 409 (E1 parity).
import { Hono } from "hono";
import { getDb, type Env } from "../db";
import { guard, json, fail } from "../http";
import { workoutLogSchema } from "../api-validation";
import { loadTemplate, row, rows } from "../repo";
import { zBody } from "../validation";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function sessionOn(db: D1Database, date: string) {
  return row(
    db,
    `SELECT ps.id, ps.date, ps.status, ps.template_id AS templateId
     FROM plan_sessions ps WHERE ps.date = ?`,
    date,
  );
}

async function serialize(
  db: D1Database,
  date: string,
  log: Record<string, unknown>,
  status = 200,
) {
  const raw = await rows(
    db,
    `SELECT sl.set_index AS setIndex, sl.weight_kg AS weightKg, sl.reps, sl.done,
            sl.template_exercise_id AS templateExerciseId, e.name AS exerciseName
     FROM set_logs sl
     JOIN template_exercises te ON te.id = sl.template_exercise_id
     JOIN exercises e ON e.id = te.exercise_id
     WHERE sl.workout_log_id = ?
     ORDER BY sl.set_index, sl.id`,
    Number(log.id),
  );
  const sets = raw.map((s) => ({ ...s, done: Number(s.done) === 1 }));
  const session = await sessionOn(db, date);
  const template = session
    ? await loadTemplate(db, Number(session.templateId))
    : null;
  return json(
    {
      date,
      status: "logged",
      readOnly: true,
      effort: log.effort,
      note: log.note,
      template: template ? { id: template.id, name: template.name } : null,
      sets,
    },
    status,
  );
}

export const workoutLogs = new Hono<{ Bindings: Env }>()
  .get("/:date", (c) =>
    guard(async () => {
      const date = c.req.param("date");
      if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
      const db = getDb(c.env);
      const log = await row(
        db,
        "SELECT id, effort, note FROM workout_logs WHERE date = ?",
        date,
      );
      if (!log) return fail("No workout logged for this date", "date", 404);
      return serialize(db, date, log);
    }),
  )
  .post("/:date", zBody(workoutLogSchema), (c) =>
    guard(async () => {
      const date = c.req.param("date");
      if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
      const input = c.get("validated");
      const db = getDb(c.env);
      const session = await sessionOn(db, date);
      if (!session)
        return fail("No session planned for this date", "date", 404);
      if (session.status === "logged")
        return fail("This day is already logged and read-only", "date", 409);
      const templateId = Number(session.templateId);
      for (const s of input.sets) {
        const te = await row(
          db,
          "SELECT id FROM template_exercises WHERE id = ? AND template_id = ?",
          s.templateExerciseId,
          templateId,
        );
        if (!te)
          return fail(
            "Set references an exercise outside the planned template",
            "sets",
          );
      }
      // Log + sets + status flip are one atomic batch; log id resolved by the
      // UNIQUE date via subselect inside the batch.
      const LOG_ID = "(SELECT id FROM workout_logs WHERE date = ?)";
      await db.batch([
        db
          .prepare(
            "INSERT INTO workout_logs (plan_session_id, date, effort, note) VALUES (?, ?, ?, ?)",
          )
          .bind(Number(session.id), date, input.effort, input.note ?? null),
        ...input.sets.map((s) =>
          db
            .prepare(
              `INSERT INTO set_logs (workout_log_id, template_exercise_id, set_index, weight_kg, reps, done)
               VALUES (${LOG_ID}, ?, ?, ?, ?, ?)`,
            )
            .bind(
              date,
              s.templateExerciseId,
              s.setIndex,
              s.weightKg ?? null,
              s.reps ?? null,
              s.done ? 1 : 0,
            ),
        ),
        db
          .prepare("UPDATE plan_sessions SET status = 'logged' WHERE id = ?")
          .bind(Number(session.id)),
      ]);
      const log = await row(
        db,
        "SELECT id, effort, note FROM workout_logs WHERE date = ?",
        date,
      );
      if (!log) return fail("No workout logged for this date", "date", 404);
      return serialize(db, date, log, 201);
    }),
  );
