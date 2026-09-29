// /api/workout-logs/:date — POST "Cerrar sesión": persiste el log + las series de
// fuerza y las marcas de cardio, y marca la sesión como logged en un batch. Un
// segundo POST responde 409; PUT corrige un registro existente (reemplaza series
// y cardio; los ejercicios de la sesión no cambian).
import { Hono } from "hono";
import { type WorkoutLogInput, workoutLogSchema } from "../api-validation";
import { type Env, getDb } from "../db";
import { fail, guard, json } from "../http";
import { row, rows } from "../repo";
import { zBody } from "../validation";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function sessionOn(db: D1Database, date: string) {
  return row(
    db,
    "SELECT id, date, status, name FROM plan_sessions WHERE date = ?",
    date,
  );
}

/** kind de cada plan_session_exercise referenciado; ausente = fuera de la sesión. */
async function kindsOf(
  db: D1Database,
  sessionId: number,
  ids: number[],
): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const marks = ids.map(() => "?").join(",");
  const found = await rows(
    db,
    `SELECT pse.id, e.kind AS kind
     FROM plan_session_exercises pse JOIN exercises e ON e.id = pse.exercise_id
     WHERE pse.plan_session_id = ? AND pse.id IN (${marks})`,
    sessionId,
    ...ids,
  );
  return new Map(found.map((r) => [Number(r.id), String(r.kind)]));
}

/** 400 si alguna serie o cardio no pertenece a la sesión (o es del kind contrario). */
async function invalidItems(
  db: D1Database,
  sessionId: number,
  input: WorkoutLogInput,
): Promise<Response | null> {
  const kinds = await kindsOf(db, sessionId, [
    ...input.sets.map((s) => s.planSessionExerciseId),
    ...input.cardio.map((c) => c.planSessionExerciseId),
  ]);
  for (const s of input.sets) {
    if (kinds.get(s.planSessionExerciseId) !== "strength")
      return fail(
        "Set references an exercise outside the planned session",
        "sets",
      );
  }
  for (const cardio of input.cardio) {
    const kind = kinds.get(cardio.planSessionExerciseId);
    if (kind === undefined || kind === "strength")
      return fail(
        "Cardio references an exercise outside the planned session",
        "cardio",
      );
  }
  return null;
}

/** INSERTs de series y cardio colgando del log de `date` (subselect por la fecha UNIQUE). */
function itemInserts(db: D1Database, date: string, input: WorkoutLogInput) {
  const LOG_ID = "(SELECT id FROM workout_logs WHERE date = ?)";
  return [
    ...input.sets.map((s) =>
      db
        .prepare(
          `INSERT INTO set_logs (workout_log_id, plan_session_exercise_id, set_index, weight_kg, reps, done)
           VALUES (${LOG_ID}, ?, ?, ?, ?, ?)`,
        )
        .bind(
          date,
          s.planSessionExerciseId,
          s.setIndex,
          s.weightKg ?? null,
          s.reps ?? null,
          s.done ? 1 : 0,
        ),
    ),
    ...input.cardio.map((cardio) =>
      db
        .prepare(
          `INSERT INTO cardio_logs (workout_log_id, plan_session_exercise_id, distance_km, duration_min, done)
           VALUES (${LOG_ID}, ?, ?, ?, ?)`,
        )
        .bind(
          date,
          cardio.planSessionExerciseId,
          cardio.distanceKm ?? null,
          cardio.durationMin ?? null,
          cardio.done ? 1 : 0,
        ),
    ),
  ];
}

async function serialize(
  db: D1Database,
  date: string,
  log: Record<string, unknown>,
  status = 200,
) {
  const rawSets = await rows(
    db,
    `SELECT sl.set_index AS setIndex, sl.weight_kg AS weightKg, sl.reps, sl.done,
            sl.plan_session_exercise_id AS planSessionExerciseId,
            e.name AS exerciseName, e.kind AS kind, e.id AS exerciseId
     FROM set_logs sl
     JOIN plan_session_exercises pse ON pse.id = sl.plan_session_exercise_id
     JOIN exercises e ON e.id = pse.exercise_id
     WHERE sl.workout_log_id = ?
     ORDER BY pse.position, sl.set_index, sl.id`,
    Number(log.id),
  );
  const sets = rawSets.map((s) => ({ ...s, done: Number(s.done) === 1 }));
  const rawCardio = await rows(
    db,
    `SELECT cl.plan_session_exercise_id AS planSessionExerciseId, cl.distance_km AS distanceKm,
            cl.duration_min AS durationMin, cl.done, e.name AS exerciseName
     FROM cardio_logs cl
     JOIN plan_session_exercises pse ON pse.id = cl.plan_session_exercise_id
     JOIN exercises e ON e.id = pse.exercise_id
     WHERE cl.workout_log_id = ?
     ORDER BY pse.position, cl.id`,
    Number(log.id),
  );
  const cardio = rawCardio.map((r) => ({ ...r, done: Number(r.done) === 1 }));
  const session = await sessionOn(db, date);
  return json(
    {
      date,
      status: "logged",
      readOnly: true,
      effort: log.effort,
      note: log.note,
      session: session ? { id: session.id, name: session.name } : null,
      sets,
      cardio,
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
      const sessionId = Number(session.id);
      const invalid = await invalidItems(db, sessionId, input);
      if (invalid) return invalid;
      // Log + series + cardio + status flip son un solo batch.
      await db.batch([
        db
          .prepare(
            "INSERT INTO workout_logs (plan_session_id, date, effort, note) VALUES (?, ?, ?, ?)",
          )
          .bind(sessionId, date, input.effort, input.note ?? null),
        ...itemInserts(db, date, input),
        db
          .prepare("UPDATE plan_sessions SET status = 'logged' WHERE id = ?")
          .bind(sessionId),
      ]);
      const log = await row(
        db,
        "SELECT id, effort, note FROM workout_logs WHERE date = ?",
        date,
      );
      if (!log) return fail("No workout logged for this date", "date", 404);
      return serialize(db, date, log, 201);
    }),
  )
  .put("/:date", zBody(workoutLogSchema), (c) =>
    guard(async () => {
      const date = c.req.param("date");
      if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
      const input = c.get("validated");
      const db = getDb(c.env);
      const log = await row(
        db,
        "SELECT id, plan_session_id FROM workout_logs WHERE date = ?",
        date,
      );
      if (!log) return fail("No workout logged for this date", "date", 404);
      const invalid = await invalidItems(
        db,
        Number(log.plan_session_id),
        input,
      );
      if (invalid) return invalid;
      // Reemplazo completo en un batch: si algo falla, el registro anterior queda.
      await db.batch([
        db
          .prepare("UPDATE workout_logs SET effort = ?, note = ? WHERE id = ?")
          .bind(input.effort, input.note ?? null, log.id),
        db
          .prepare("DELETE FROM set_logs WHERE workout_log_id = ?")
          .bind(log.id),
        db
          .prepare("DELETE FROM cardio_logs WHERE workout_log_id = ?")
          .bind(log.id),
        ...itemInserts(db, date, input),
      ]);
      return serialize(db, date, {
        id: log.id,
        effort: input.effort,
        note: input.note ?? null,
      });
    }),
  );
