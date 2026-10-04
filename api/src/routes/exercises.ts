// /api/exercises — GET (?tag=) · POST · /:id GET/PUT/DELETE · /:id/last GET ·
// /:id/history GET. last-values endpoint per E1 design D5.
// Catálogo: lo lee todo el mundo; solo el admin lo escribe (403).
import { Hono } from "hono";
import { type ExerciseInput, exerciseSchema } from "../api-validation";
import { type AppContext, getDb } from "../db";
import { dateFilter, fail, guard, json, parseId, readCursor } from "../http";
import { listExercises, loadExercise, type Row, row, rows } from "../repo";
import { zBody } from "../validation";

/** Serie marcada de un ejercicio (el `done` ya lo garantiza la consulta). */
type Mark = { setIndex: number; weightKg: number | null; reps: number };
/** Marca de cardio hecha. */
type CardioMark = { distanceKm: number | null; durationMin: number | null };

const markOf = (r: Row): Mark => ({
  setIndex: Number(r.setIndex),
  weightKg: r.weightKg === null ? null : Number(r.weightKg),
  reps: Number(r.reps),
});

const cardioMarkOf = (r: Row): CardioMark => ({
  distanceKm: r.distanceKm === null ? null : Number(r.distanceKm),
  durationMin: r.durationMin === null ? null : Number(r.durationMin),
});

/** Días con series marcadas del ejercicio (una fila por fecha). */
const SET_DATES = `SELECT wl.date AS date, MAX(ps.name) AS sessionName
FROM set_logs sl
JOIN plan_session_exercises pse ON pse.id = sl.plan_session_exercise_id
JOIN workout_logs wl ON wl.id = sl.workout_log_id
JOIN plan_sessions ps ON ps.id = wl.plan_session_id
WHERE pse.exercise_id = ? AND ps.user_id = ? AND sl.done = 1`;

/** Días con cardio hecho del ejercicio. */
const CARDIO_DATES = `SELECT wl.date AS date, MAX(ps.name) AS sessionName
FROM cardio_logs cl
JOIN plan_session_exercises pse ON pse.id = cl.plan_session_exercise_id
JOIN workout_logs wl ON wl.id = cl.workout_log_id
JOIN plan_sessions ps ON ps.id = wl.plan_session_id
WHERE pse.exercise_id = ? AND ps.user_id = ? AND cl.done = 1`;

/** Series marcadas del ejercicio (la fecha va en el IN que añade la ruta). */
const SET_MARKS = `SELECT wl.date AS date, sl.set_index AS setIndex,
       sl.weight_kg AS weightKg, sl.reps AS reps
FROM set_logs sl
JOIN plan_session_exercises pse ON pse.id = sl.plan_session_exercise_id
JOIN workout_logs wl ON wl.id = sl.workout_log_id
JOIN plan_sessions ps ON ps.id = wl.plan_session_id
WHERE pse.exercise_id = ? AND ps.user_id = ? AND sl.done = 1`;

/** Las mejores series KILOS primero (y a igualdad, reps) y, sin kilos, las
 *  que más repiten: la fila es la del día que las consiguió. */
const SET_BEST = `SELECT wl.date AS date, ps.name AS sessionName,
       sl.set_index AS setIndex, sl.weight_kg AS weightKg, sl.reps AS reps
FROM set_logs sl
JOIN plan_session_exercises pse ON pse.id = sl.plan_session_exercise_id
JOIN workout_logs wl ON wl.id = sl.workout_log_id
JOIN plan_sessions ps ON ps.id = wl.plan_session_id
WHERE pse.exercise_id = ? AND ps.user_id = ? AND sl.done = 1`;

/** La mejor marca de cardio: la distancia más larga (y a igualdad, el tiempo). */
const CARDIO_BEST = `SELECT wl.date AS date, ps.name AS sessionName,
       cl.distance_km AS distanceKm, cl.duration_min AS durationMin
FROM cardio_logs cl
JOIN plan_session_exercises pse ON pse.id = cl.plan_session_exercise_id
JOIN workout_logs wl ON wl.id = cl.workout_log_id
JOIN plan_sessions ps ON ps.id = wl.plan_session_id
WHERE pse.exercise_id = ? AND ps.user_id = ? AND cl.done = 1`;

/** Marcas de cardio del ejercicio. */
const CARDIO_MARKS = `SELECT wl.date AS date, cl.distance_km AS distanceKm,
       cl.duration_min AS durationMin
FROM cardio_logs cl
JOIN plan_session_exercises pse ON pse.id = cl.plan_session_exercise_id
JOIN workout_logs wl ON wl.id = cl.workout_log_id
JOIN plan_sessions ps ON ps.id = wl.plan_session_id
WHERE pse.exercise_id = ? AND ps.user_id = ? AND cl.done = 1`;

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

function aliasStatements(
  name: string,
  aliases: ExerciseInput["aliases"],
  db: D1Database,
): D1PreparedStatement[] {
  return [...new Set(aliases)].map((a) =>
    db
      .prepare(
        `INSERT INTO exercise_aliases (exercise_id, alias) VALUES ((SELECT id FROM exercises WHERE name = ?), ?)`,
      )
      .bind(name, a),
  );
}

export const exercises = new Hono<AppContext>()
  .get("/", (c) =>
    guard(async () => {
      return json(await listExercises(getDb(c.env), c.req.query("tag")));
    }),
  )
  .post("/", zBody(exerciseSchema), (c) =>
    guard(async () => {
      // El catálogo lo escribe solo el admin: leerlo es de todos, tocarlo no.
      if (c.get("user").role !== "admin")
        return json({ error: "Forbidden" }, 403);
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
        ...aliasStatements(name, input.aliases, db),
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
      // El catálogo lo escribe solo el admin.
      if (c.get("user").role !== "admin")
        return json({ error: "Forbidden" }, 403);
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
        db.prepare("DELETE FROM exercise_aliases WHERE exercise_id=?").bind(id),
        ...aliasStatements(name, input.aliases, db),
      ]);
      return json(await loadExercise(db, id));
    }),
  )
  .delete("/:id", (c) =>
    guard(async () => {
      // El catálogo lo borra solo el admin.
      if (c.get("user").role !== "admin")
        return json({ error: "Forbidden" }, 403);
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
      const userId = c.get("user").id;
      if (!(await row(db, "SELECT id FROM exercises WHERE id = ?", id)))
        return fail("Not found", undefined, 404);
      // ?before=YYYY-MM-DD: solo lo registrado antes de esa fecha (registrar un día pasado).
      const before = c.req.query("before") ?? "9999-12-31";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(before))
        return fail("before must be YYYY-MM-DD", "before");
      // Las marcas son del usuario: el ejercicio es de catálogo, su prefill no.
      const last = await row(
        db,
        `SELECT sl.weight_kg AS weightKg, sl.reps, wl.date
         FROM set_logs sl
         JOIN plan_session_exercises pse ON pse.id = sl.plan_session_exercise_id
         JOIN workout_logs wl ON wl.id = sl.workout_log_id
         JOIN plan_sessions ps ON ps.id = wl.plan_session_id
         WHERE pse.exercise_id = ? AND ps.user_id = ? AND wl.date < ?
           AND (sl.weight_kg IS NOT NULL OR sl.reps IS NOT NULL)
         ORDER BY wl.date DESC, sl.id DESC
         LIMIT 1`,
        id,
        userId,
        before,
      );
      return json({ exerciseId: id, last: last ?? null });
    }),
  )
  // Historial del ejercicio: las series marcadas (o el cardio hecho) por día,
  // del más reciente al más antiguo. Fuerza y cardio comparten el índice, pero
  // cada uno lee su tabla: dos consultas fijas —fechas y marcas de esas fechas—.
  .get("/:id/history", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const cursor = readCursor((key) => c.req.query(key));
      if (cursor instanceof Response) return cursor;
      const db = getDb(c.env);
      const exercise = await row(
        db,
        "SELECT id, kind FROM exercises WHERE id = ?",
        id,
      );
      if (!exercise) return fail("Not found", undefined, 404);
      const isCardio = String(exercise.kind) !== "strength";
      // El rango pedido y el cursor son las mismas condiciones para las dos consultas.
      const filter = dateFilter(cursor);
      const userId = c.get("user").id;
      const dates = await rows(
        db,
        `${isCardio ? CARDIO_DATES : SET_DATES}${filter.conditions
          .map((condition) => ` AND ${condition}`)
          .join("")}
         GROUP BY wl.date ORDER BY wl.date DESC LIMIT ?`,
        id,
        userId,
        ...filter.args,
        cursor.limit + 1,
      );
      const page = dates.slice(0, cursor.limit);
      // Las marcas de la página: la lista de fechas acota la subconsulta, así que
      // el número de consultas no crece con el histórico (≤ 61 parámetros).
      const marks =
        page.length === 0
          ? []
          : await rows(
              db,
              `${isCardio ? CARDIO_MARKS : SET_MARKS}
               AND wl.date IN (${page.map(() => "?").join(",")})
               ORDER BY wl.date DESC${isCardio ? ", cl.id" : ", sl.set_index, sl.id"}`,
              id,
              userId,
              ...page.map((d) => String(d.date)),
            );
      const setsByDate = new Map<string, Mark[]>();
      const cardioByDate = new Map<string, CardioMark>();
      for (const m of marks) {
        const date = String(m.date);
        if (isCardio) cardioByDate.set(date, cardioMarkOf(m));
        else setsByDate.set(date, [...(setsByDate.get(date) ?? []), markOf(m)]);
      }
      const sessions = page.map((d) => {
        const date = String(d.date);
        return {
          date,
          sessionName: d.sessionName === null ? null : String(d.sessionName),
          sets: setsByDate.get(date) ?? [],
          cardio: cardioByDate.get(date) ?? null,
        };
      });
      // El «mejor» del ejercicio entero (con el rango pedido si lo hay), no el de
      // la página: una consulta más, ajena al número de filas.
      const bestRow = await row(
        db,
        `${isCardio ? CARDIO_BEST : SET_BEST}${filter.conditions
          .map((condition) => ` AND ${condition}`)
          .join("")}
         ORDER BY ${
           isCardio
             ? "(cl.distance_km IS NULL), cl.distance_km DESC, cl.duration_min DESC"
             : "(sl.weight_kg IS NULL), sl.weight_kg DESC, sl.reps DESC"
}, wl.date DESC
         LIMIT 1`,
        id,
        userId,
        ...filter.args,
      );
      const best = bestRow
        ? {
            date: String(bestRow.date),
            sessionName:
              bestRow.sessionName === null ? null : String(bestRow.sessionName),
            sets: isCardio ? [] : [markOf(bestRow)],
            cardio: isCardio ? cardioMarkOf(bestRow) : null,
          }
        : null;
      return json({
        exerciseId: id,
        kind: String(exercise.kind),
        best,
        sessions,
        next:
          dates.length > cursor.limit
            ? sessions[sessions.length - 1].date
            : null,
      });
    }),
  );
