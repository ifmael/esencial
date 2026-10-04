// /api/workout-logs/:date — POST "Cerrar sesión": persiste el log + las series de
// fuerza y las marcas de cardio, y marca la sesión como logged en un batch. Un
// segundo POST responde 409; PUT corrige un registro existente (reemplaza series
// y cardio; los ejercicios de la sesión no cambian).
import { Hono } from "hono";
import { type WorkoutLogInput, workoutLogSchema } from "../api-validation";
import { type AppContext, getDb } from "../db";
import { dateFilter, fail, guard, json, readCursor } from "../http";
import { row, rows } from "../repo";
import { zBody } from "../validation";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Índice del histórico: un día registrado por fila, con lo hecho (series y
 *  cardio marcados) contado en la misma consulta. Las subconsultas mantienen el
 *  número de consultas constante, como las listas. */
const HISTORY_DAYS = `SELECT wl.date AS date, ps.name AS sessionName,
       wl.effort AS effort, wl.note AS note,
       (SELECT COUNT(DISTINCT sl.plan_session_exercise_id) FROM set_logs sl
         WHERE sl.workout_log_id = wl.id AND sl.done = 1) AS exercises,
       (SELECT COUNT(*) FROM set_logs sl
         WHERE sl.workout_log_id = wl.id AND sl.done = 1) AS sets,
       (SELECT COUNT(*) FROM cardio_logs cl
         WHERE cl.workout_log_id = wl.id AND cl.done = 1) AS cardio
FROM workout_logs wl
JOIN plan_sessions ps ON ps.id = wl.plan_session_id AND ps.user_id = ?`;

/** La sesión planificada del usuario `userId` ese día (el UNIQUE es por usuario). */
async function sessionOn(db: D1Database, date: string, userId: number) {
  return row(
    db,
    "SELECT id, date, status, name FROM plan_sessions WHERE date = ? AND user_id = ?",
    date,
    userId,
  );
}

/** El log de ese día y usuario; la fecha no es UNIQUE (cada usuario tiene el suyo). */
const LOG_OF_USER = `SELECT wl.id, wl.effort, wl.note, wl.plan_session_id
FROM workout_logs wl
JOIN plan_sessions ps ON ps.id = wl.plan_session_id
WHERE wl.date = ? AND ps.user_id = ?`;

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

/** INSERTs de series y cardio colgando del log de ese día y usuario (subselect
 *  acotado por la fecha y el dueño de la sesión; el UNIQUE es por usuario). */
function itemInserts(
  db: D1Database,
  date: string,
  userId: number,
  input: WorkoutLogInput,
) {
  const LOG_ID =
    "(SELECT wl.id FROM workout_logs wl JOIN plan_sessions ps ON ps.id = wl.plan_session_id WHERE wl.date = ? AND ps.user_id = ?)";
  return [
    ...input.sets.map((s) =>
      db
        .prepare(
          `INSERT INTO set_logs (workout_log_id, plan_session_exercise_id, set_index, weight_kg, reps, done)
           VALUES (${LOG_ID}, ?, ?, ?, ?, ?)`,
        )
        .bind(
          date,
          userId,
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
          userId,
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
  userId: number,
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
  const session = await sessionOn(db, date, userId);
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

export const workoutLogs = new Hono<AppContext>()
  // Índice del histórico: los días registrados, del más reciente al más antiguo,
  // paginados con `?before=&limit=` (el detalle sigue en /:date).
  .get("/", (c) =>
    guard(async () => {
      const cursor = readCursor((key) => c.req.query(key));
      if (cursor instanceof Response) return cursor;
      const filter = dateFilter(cursor);
      const found = await rows(
        getDb(c.env),
        `${HISTORY_DAYS}${
          filter.conditions.length > 0
            ? ` WHERE ${filter.conditions.join(" AND ")}`
            : ""
        }
         ORDER BY wl.date DESC LIMIT ?`,
        c.get("user").id,
        ...filter.args,
        cursor.limit + 1,
      );
      const days = found.slice(0, cursor.limit).map((r) => ({
        date: String(r.date),
        sessionName: r.sessionName === null ? null : String(r.sessionName),
        effort: Number(r.effort),
        note: r.note === null ? null : String(r.note),
        exercises: Number(r.exercises),
        sets: Number(r.sets),
        cardio: Number(r.cardio),
      }));
      // Una fila de más = hay página siguiente; el cursor es su última fecha.
      return json({
        days,
        next: found.length > cursor.limit ? days[days.length - 1].date : null,
      });
    }),
  )
  .get("/:date", (c) =>
    guard(async () => {
      const date = c.req.param("date");
      if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
      const db = getDb(c.env);
      const userId = c.get("user").id;
      const log = await row(db, LOG_OF_USER, date, userId);
      if (!log) return fail("No workout logged for this date", "date", 404);
      return serialize(db, date, log, userId);
    }),
  )
  .post("/:date", zBody(workoutLogSchema), (c) =>
    guard(async () => {
      const date = c.req.param("date");
      if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
      const input = c.get("validated");
      const db = getDb(c.env);
      const userId = c.get("user").id;
      const session = await sessionOn(db, date, userId);
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
        ...itemInserts(db, date, userId, input),
        db
          .prepare(
            "UPDATE plan_sessions SET status = 'logged' WHERE id = ? AND user_id = ?",
          )
          .bind(sessionId, userId),
      ]);
      const log = await row(db, LOG_OF_USER, date, userId);
      if (!log) return fail("No workout logged for this date", "date", 404);
      return serialize(db, date, log, userId, 201);
    }),
  )
  .put("/:date", zBody(workoutLogSchema), (c) =>
    guard(async () => {
      const date = c.req.param("date");
      if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
      const input = c.get("validated");
      const db = getDb(c.env);
      const userId = c.get("user").id;
      const log = await row(db, LOG_OF_USER, date, userId);
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
        ...itemInserts(db, date, userId, input),
      ]);
      return serialize(
        db,
        date,
        {
          id: log.id,
          effort: input.effort,
          note: input.note ?? null,
        },
        userId,
      );
    }),
  );
