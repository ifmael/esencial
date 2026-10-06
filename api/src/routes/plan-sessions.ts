// /api/plan-sessions — la sesión ES el día: nombre + ejercicios expandidos
// (fuerza y/o cardio), sin duplicados. GET lista · POST crea · /:id GET/PUT/DELETE.
// Una sesión `logged` solo admite el recuento de series (PUT); DELETE → 409.
// El plan es privado del usuario: todo filtra por user_id (un id ajeno es 404) y
// el UNIQUE es (user_id, date), así que dos personas pueden planificar el mismo día.
import { Hono } from "hono";
import {
  planSessionCreateSchema,
  planSessionUpdateSchema,
} from "../api-validation";
import { blockError } from "../blocks";
import { type AppContext, getDb } from "../db";
import { fail, guard, json, parseId } from "../http";
import { row, rows } from "../repo";
import { zBody } from "../validation";

type Item = {
  exerciseId: number;
  targetSets?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDistanceKm?: number | null;
  targetDurationMin?: number | null;
  restSecs?: number | null;
  restAfterSecs?: number | null;
  /** `true` = va pegado al ejercicio siguiente (bloque/superserie). */
  superset?: boolean;
};

/** Sesión del usuario `userId` con sus ejercicios; un id ajeno es null (404). */
async function loadSession(
  db: D1Database,
  id: number,
  userId: number,
): Promise<Record<string, unknown> | null> {
  const head = await row(
    db,
    "SELECT id, date, name, status FROM plan_sessions WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  if (!head) return null;
  head.exercises = (
    await rows(
      db,
      `SELECT pse.id, pse.exercise_id AS exerciseId, pse.position, pse.superset AS superset,
            pse.target_sets AS targetSets, pse.target_reps_min AS targetRepsMin, pse.target_reps_max AS targetRepsMax,
            pse.target_distance_km AS targetDistanceKm, pse.target_duration_min AS targetDurationMin,
            pse.rest_secs AS restSecs, pse.rest_after_secs AS restAfterSecs,
            e.name AS exerciseName, e.kind AS kind, e.metric AS metric
     FROM plan_session_exercises pse JOIN exercises e ON e.id = pse.exercise_id
     WHERE pse.plan_session_id = ? ORDER BY pse.position, pse.id`,
      id,
    )
  ).map((e) => ({ ...e, superset: Boolean(e.superset) }));
  return head;
}

/** Fila de `plan_session_exercises` tal como la lee el PUT. */
type CurrentItem = {
  id: number;
  exerciseId: number;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDistanceKm: number | null;
  targetDurationMin: number | null;
  restSecs: number | null;
  restAfterSecs: number | null;
  superset: number;
};

/** Una sesión registrada solo admite cambiar el recuento de series: los mismos
 * ejercicios en el mismo orden y el resto de objetivos (descansos incluidos)
 * intactos. */
function onlySetCountsChange(current: CurrentItem[], items: Item[]): boolean {
  if (current.length !== items.length) return false;
  return current.every((cur, i) => {
    const it = items[i];
    return (
      cur.exerciseId === it.exerciseId &&
      cur.targetRepsMin === (it.targetRepsMin ?? null) &&
      cur.targetRepsMax === (it.targetRepsMax ?? null) &&
      cur.targetDistanceKm === (it.targetDistanceKm ?? null) &&
      cur.targetDurationMin === (it.targetDurationMin ?? null) &&
      cur.restSecs === (it.restSecs ?? null) &&
      cur.restAfterSecs === (it.restAfterSecs ?? null) &&
      Boolean(cur.superset) === (it.superset ?? false)
    );
  });
}

/** Duplicados, ejercicios inexistentes y bloques mal formados son 400 en `items`. */
async function itemsError(
  db: D1Database,
  items: Item[],
): Promise<string | null> {
  const ids = items.map((i) => i.exerciseId);
  if (new Set(ids).size !== ids.length)
    return "Ejercicio duplicado en la sesión";
  const marks = ids.map(() => "?").join(",");
  const found = await rows(
    db,
    `SELECT id, kind FROM exercises WHERE id IN (${marks})`,
    ...ids,
  );
  if (found.length !== ids.length) return "Ejercicio desconocido";
  return blockError(
    items,
    found.map((r) => ({ id: Number(r.id), kind: String(r.kind) })),
  );
}

/** INSERT ordenado de los items; `where` resuelve el id de la sesión dentro del batch. */
function itemStatements(
  where: { sql: string; args: unknown[] },
  items: Item[],
  db: D1Database,
): D1PreparedStatement[] {
  return items.map((it, pos) =>
    db
      .prepare(
        `INSERT INTO plan_session_exercises (plan_session_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_distance_km, target_duration_min, rest_secs, rest_after_secs, superset)
         VALUES (${where.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ...(where.args as never[]),
        it.exerciseId,
        pos,
        it.targetSets ?? null,
        it.targetRepsMin ?? null,
        it.targetRepsMax ?? null,
        it.targetDistanceKm ?? null,
        it.targetDurationMin ?? null,
        it.restSecs ?? null,
        it.restAfterSecs ?? null,
        it.superset ? 1 : 0,
      ),
  );
}

const cleanName = (name: string | null | undefined): string | null =>
  name?.trim() ? name.trim() : null;

export const planSessions = new Hono<AppContext>()
  .get("/", (c) =>
    guard(async () => {
      const db = getDb(c.env);
      const userId = c.get("user").id;
      const ids = await rows(
        db,
        "SELECT id FROM plan_sessions WHERE user_id = ? ORDER BY date",
        userId,
      );
      // Cada sesión con sus ejercicios: la rejilla semanal pinta el desglose.
      return json(
        await Promise.all(
          ids.map((r) => loadSession(db, Number(r.id), userId)),
        ),
      );
    }),
  )
  .post("/", zBody(planSessionCreateSchema), (c) =>
    guard(async () => {
      const input = c.get("validated");
      const db = getDb(c.env);
      const userId = c.get("user").id;
      const problem = await itemsError(db, input.items);
      if (problem) return fail(problem, "items");
      if (
        await row(
          db,
          "SELECT id FROM plan_sessions WHERE date = ? AND user_id = ?",
          input.date,
          userId,
        )
      )
        return fail("Ya hay una sesión ese día", "date", 409);
      const results = await db.batch([
        db
          .prepare(
            "INSERT INTO plan_sessions (user_id, date, name, status) VALUES (?, ?, ?, 'planned')",
          )
          .bind(userId, input.date, cleanName(input.name)),
        ...itemStatements(
          {
            sql: "(SELECT id FROM plan_sessions WHERE date = ? AND user_id = ?)",
            args: [input.date, userId],
          },
          input.items,
          db,
        ),
      ]);
      return json(
        await loadSession(db, Number(results[0].meta.last_row_id), userId),
        201,
      );
    }),
  )
  .get("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const session = await loadSession(getDb(c.env), id, c.get("user").id);
      return session ? json(session) : fail("Not found", undefined, 404);
    }),
  )
  .put("/:id", zBody(planSessionUpdateSchema), (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const db = getDb(c.env);
      const userId = c.get("user").id;
      const session = await row(
        db,
        "SELECT id, name, status FROM plan_sessions WHERE id = ? AND user_id = ?",
        id,
        userId,
      );
      if (!session) return fail("Not found", undefined, 404);
      const input = c.get("validated");
      const problem = await itemsError(db, input.items);
      if (problem) return fail(problem, "items");
      const current = (await rows(
        db,
        `SELECT id, exercise_id AS exerciseId, target_sets AS targetSets,
                target_reps_min AS targetRepsMin, target_reps_max AS targetRepsMax,
                target_distance_km AS targetDistanceKm, target_duration_min AS targetDurationMin,
                rest_secs AS restSecs, rest_after_secs AS restAfterSecs, superset AS superset
         FROM plan_session_exercises WHERE plan_session_id = ?
         ORDER BY position, id`,
        id,
      )) as unknown as CurrentItem[];

      // Sesión registrada: solo el recuento de series. Los items no se recrean
      // (las series del registro cuelgan de sus ids) ni cambia nada más.
      if (session.status === "logged") {
        if (
          !onlySetCountsChange(current, input.items) ||
          cleanName(input.name) !== (session.name ?? null)
        )
          return fail("Sesión ya registrada", undefined, 409);
        await db.batch(
          input.items.map((it) =>
            db
              .prepare(
                "UPDATE plan_session_exercises SET target_sets = ? WHERE plan_session_id = ? AND exercise_id = ?",
              )
              .bind(it.targetSets ?? null, id, it.exerciseId),
          ),
        );
        return json(await loadSession(db, id, userId));
      }

      // Upsert: los items que siguen conservan su id —el registro del día cuelga
      // de ellos— y los que ya no están se borran.
      const kept = new Map(current.map((r) => [r.exerciseId, r.id]));
      await db.batch([
        db
          .prepare(
            "UPDATE plan_sessions SET name = ? WHERE id = ? AND user_id = ?",
          )
          .bind(cleanName(input.name), id, userId),
        ...input.items.map((it, pos) => {
          const targets = [
            pos,
            it.targetSets ?? null,
            it.targetRepsMin ?? null,
            it.targetRepsMax ?? null,
            it.targetDistanceKm ?? null,
            it.targetDurationMin ?? null,
            it.restSecs ?? null,
            it.restAfterSecs ?? null,
            it.superset ? 1 : 0,
          ];
          const existing = kept.get(it.exerciseId);
          if (existing === undefined)
            return db
              .prepare(
                `INSERT INTO plan_session_exercises (plan_session_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_distance_km, target_duration_min, rest_secs, rest_after_secs, superset)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(id, it.exerciseId, ...targets);
          return db
            .prepare(
              `UPDATE plan_session_exercises
               SET position = ?, target_sets = ?, target_reps_min = ?, target_reps_max = ?, target_distance_km = ?, target_duration_min = ?, rest_secs = ?, rest_after_secs = ?, superset = ?
               WHERE id = ?`,
            )
            .bind(...targets, existing);
        }),
        ...current
          .filter(
            (r) => !input.items.some((i) => i.exerciseId === r.exerciseId),
          )
          .map((r) =>
            db
              .prepare("DELETE FROM plan_session_exercises WHERE id = ?")
              .bind(r.id),
          ),
      ]);
      return json(await loadSession(db, id, userId));
    }),
  )
  .delete("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("Not found", undefined, 404);
      const db = getDb(c.env);
      const session = await row(
        db,
        "SELECT id, status FROM plan_sessions WHERE id = ? AND user_id = ?",
        id,
        c.get("user").id,
      );
      if (!session) return fail("Not found", undefined, 404);
      if (session.status === "logged")
        return fail("Sesión ya registrada", undefined, 409);
      await db
        .prepare("DELETE FROM plan_sessions WHERE id = ? AND user_id = ?")
        .bind(id, c.get("user").id)
        .run();
      return json({});
    }),
  );
