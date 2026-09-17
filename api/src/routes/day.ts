// /api/day/:date — one-call aggregation for the DÍA screen (design D1/D3):
// meal slots for the date's ISO week/day, the scheduled session (+ logged
// summary triple), and the day note. Missing data is empty data, not errors;
// only a malformed :date fails (400 { error, field: "date" }, notes parity).
import { Hono } from "hono";
import { dayIndexOf, isoWeekOf } from "../dates";
import { type Env, getDb } from "../db";
import { fail, guard, json } from "../http";
import { row, rows } from "../repo";

// `:date{.*}` so the trailing-slash case (`/api/day/`) reaches validation too:
// Hono mounts do not route an empty param to `/`, and the spec wants 400 there.
export const day = new Hono<{ Bindings: Env }>().get("/:date{.*}", (c) =>
  guard(async () => {
    const date = c.req.param("date");
    const isoWeek = isoWeekOf(date);
    const dayIndex = dayIndexOf(date);
    if (isoWeek === null || dayIndex === null)
      return fail("date must be YYYY-MM-DD", "date");
    const db = getDb(c.env);

    // Slots only exist through the week plan; LEFT JOIN keeps cleared slots
    // (deleted recipe) readable as { recipeId: null, recipeName: null }.
    const meals = await rows(
      db,
      `SELECT ms.meal, ms.recipe_id AS recipeId, r.name AS recipeName, r.photo_path AS recipePhoto
       FROM meal_slots ms
       JOIN week_plans wp ON wp.id = ms.week_plan_id
       LEFT JOIN recipes r ON r.id = ms.recipe_id
       WHERE wp.iso_week = ? AND ms.day = ?
       ORDER BY CASE ms.meal WHEN 'desayuno' THEN 0 WHEN 'almuerzo' THEN 1 ELSE 2 END`,
      isoWeek,
      dayIndex,
    );

    const session = await row(
      db,
      `SELECT ps.id, ps.status, ps.template_id AS templateId, st.name AS templateName,
              wl.effort,
              COUNT(DISTINCT sl.template_exercise_id) AS exercises,
              COUNT(sl.id) AS sets
       FROM plan_sessions ps
       JOIN session_templates st ON st.id = ps.template_id
       LEFT JOIN workout_logs wl ON wl.date = ps.date
       LEFT JOIN set_logs sl ON sl.workout_log_id = wl.id
       WHERE ps.date = ?
       GROUP BY ps.id`,
      date,
    );
    const exercises = session
      ? await rows(
          db,
          `SELECT te.exercise_id AS exerciseId, e.name AS exerciseName, te.position
           FROM template_exercises te
           JOIN exercises e ON e.id = te.exercise_id
           JOIN plan_sessions ps ON ps.template_id = te.template_id
           WHERE ps.date = ?
           ORDER BY te.position`,
          date,
        )
      : [];

    const note = await row(
      db,
      "SELECT text FROM day_notes WHERE date = ?",
      date,
    );

    return json({
      date,
      isoWeek,
      dayIndex,
      meals,
      session: session
        ? {
            id: Number(session.id),
            templateId: Number(session.templateId),
            templateName: String(session.templateName),
            status: String(session.status),
            exercises,
            summary:
              session.status === "logged" && session.effort !== null
                ? {
                    effort: Number(session.effort),
                    exercises: Number(session.exercises),
                    sets: Number(session.sets),
                  }
                : null,
          }
        : null,
      note: { text: String(note?.text ?? "") },
    });
  }),
);
