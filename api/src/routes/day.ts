// /api/day/:date — one-call aggregation for the DÍA screen (design D1/D3):
// meal slots for the date's ISO week/day, the scheduled session (+ logged
// summary triple), and the day note. Missing data is empty data, not errors;
// only a malformed :date fails (400 { error, field: "date" }, notes parity).
import { Hono } from "hono";
import { dayIndexOf, isoWeekOf } from "../dates";
import { type AppContext, getDb } from "../db";
import { fail, guard, json } from "../http";
import { nutritionByRecipe, row, rows, sumNutrition } from "../repo";

// `:date{.*}` so the trailing-slash case (`/api/day/`) reaches validation too:
// Hono mounts do not route an empty param to `/`, and the spec wants 400 there.
export const day = new Hono<AppContext>().get("/:date{.*}", (c) =>
  guard(async () => {
    const date = c.req.param("date");
    const isoWeek = isoWeekOf(date);
    const dayIndex = dayIndexOf(date);
    if (isoWeek === null || dayIndex === null)
      return fail("date must be YYYY-MM-DD", "date");
    const db = getDb(c.env);
    const user = c.get("user");

    // Slots only exist through the week plan; LEFT JOIN keeps cleared slots
    // (deleted recipe) readable as { recipeId: null, recipeName: null }.
    const meals = await rows(
      db,
      `SELECT ms.meal, ms.recipe_id AS recipeId, r.name AS recipeName, r.photo_path AS recipePhoto
       FROM meal_slots ms
       JOIN week_plans wp ON wp.id = ms.week_plan_id
       LEFT JOIN recipes r ON r.id = ms.recipe_id
       WHERE wp.family_id = ? AND wp.iso_week = ? AND ms.day = ?
       ORDER BY CASE ms.meal WHEN 'desayuno' THEN 0 WHEN 'almuerzo' THEN 1 ELSE 2 END`,
      user.family_id,
      isoWeek,
      dayIndex,
    );
    // Cada comida cuenta una ración de su receta.
    const perRecipe = await nutritionByRecipe(
      db,
      meals.flatMap((m) => (m.recipeId == null ? [] : [Number(m.recipeId)])),
    );
    const nutrition = sumNutrition(
      meals.flatMap((m) => perRecipe.get(Number(m.recipeId)) ?? []),
    );

    const session = await row(
      db,
      `SELECT ps.id, ps.status, ps.name, wl.effort,
              COUNT(DISTINCT sl.plan_session_exercise_id) AS exercises,
              COUNT(sl.id) AS sets
       FROM plan_sessions ps
       LEFT JOIN workout_logs wl ON wl.plan_session_id = ps.id
       LEFT JOIN set_logs sl ON sl.workout_log_id = wl.id
       WHERE ps.user_id = ? AND ps.date = ?
       GROUP BY ps.id`,
      user.id,
      date,
    );
    const exercises = session
      ? await rows(
          db,
          `SELECT pse.exercise_id AS exerciseId, e.name AS exerciseName, e.kind AS kind,
                  pse.position, pse.target_sets AS targetSets,
                  pse.target_distance_km AS targetDistanceKm,
                  pse.target_duration_min AS targetDurationMin
           FROM plan_session_exercises pse JOIN exercises e ON e.id = pse.exercise_id
           WHERE pse.plan_session_id = ?
           ORDER BY pse.position, pse.id`,
          Number(session.id),
        )
      : [];

    const note = await row(
      db,
      "SELECT text FROM day_notes WHERE user_id = ? AND date = ?",
      user.id,
      date,
    );

    return json({
      date,
      isoWeek,
      dayIndex,
      meals,
      nutrition,
      session: session
        ? {
            id: Number(session.id),
            name: session.name == null ? null : String(session.name),
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
