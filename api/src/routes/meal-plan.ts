// /api/meal-plan/:week — GET reads slots (deleted recipe → slot reads empty),
// PUT replaces the whole week's slot set (clear + reinsert in one batch).
import { Hono } from "hono";
import { ISO_WEEK, mealPlanSchema } from "../api-validation";
import { type Env, getDb } from "../db";
import { fail, guard, json } from "../http";
import { row, rows } from "../repo";
import { zBody } from "../validation";

async function serializeSlots(
  db: D1Database,
  weekPlanId: number,
  isoWeek: string,
): Promise<Response> {
  const slots = await rows(
    db,
    `SELECT ms.day, ms.meal, ms.recipe_id AS recipeId, r.name AS recipeName, r.photo_path AS recipePhoto
     FROM meal_slots ms LEFT JOIN recipes r ON r.id = ms.recipe_id
     WHERE ms.week_plan_id = ? ORDER BY ms.day, CASE ms.meal
       WHEN 'desayuno' THEN 0 WHEN 'almuerzo' THEN 1 ELSE 2 END`,
    weekPlanId,
  );
  // recipe_id may point at a cleared slot; LEFT JOIN keeps row, name null → empty render
  return json({ isoWeek, slots });
}

export const mealPlan = new Hono<{ Bindings: Env }>()
  .get("/:week", (c) =>
    guard(async () => {
      const week = c.req.param("week");
      if (!ISO_WEEK.test(week))
        return fail("week must match YYYY-Www (ISO)", "week");
      const db = getDb(c.env);
      const plan = await row(
        db,
        "SELECT id FROM week_plans WHERE iso_week = ?",
        week,
      );
      if (!plan) return json({ isoWeek: week, slots: [] });
      return serializeSlots(db, Number(plan.id), week);
    }),
  )
  .put("/:week", zBody(mealPlanSchema), (c) =>
    guard(async () => {
      const week = c.req.param("week");
      if (!ISO_WEEK.test(week))
        return fail("week must match YYYY-Www (ISO)", "week");
      const input = c.get("validated");
      const seen = new Set<string>();
      for (const s of input.slots) {
        const key = `${s.day}|${s.meal}`;
        if (seen.has(key))
          return fail("Duplicate slot for same day and meal", "slots");
        seen.add(key);
      }
      const db = getDb(c.env);
      // One transaction: plan upsert + clear + reinsert via by-week subselect.
      const PLAN_ID = "(SELECT id FROM week_plans WHERE iso_week = ?)";
      await db.batch([
        db
          .prepare("INSERT OR IGNORE INTO week_plans (iso_week) VALUES (?)")
          .bind(week),
        db
          .prepare(`DELETE FROM meal_slots WHERE week_plan_id = ${PLAN_ID}`)
          .bind(week),
        ...input.slots.map((s) =>
          db
            .prepare(
              `INSERT INTO meal_slots (week_plan_id, day, meal, recipe_id) VALUES (${PLAN_ID}, ?, ?, ?)`,
            )
            .bind(week, s.day, s.meal, s.recipeId ?? null),
        ),
      ]);
      const plan = await row(
        db,
        "SELECT id FROM week_plans WHERE iso_week = ?",
        week,
      );
      return serializeSlots(db, Number(plan?.id), week);
    }),
  );
