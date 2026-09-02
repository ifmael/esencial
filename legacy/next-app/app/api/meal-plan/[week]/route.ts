// /api/meal-plan/[week] — GET reads slots (deleted recipe → slot reads empty),
// PUT replaces the whole week's slot set.
import { getDb } from "@/lib/db";
import { guard, json, fail, readValidated } from "@/lib/api";
import { ISO_WEEK, mealPlanSchema } from "@/lib/api-validation";
import { row, rows } from "@/lib/repo";

type Ctx = { params: Promise<{ week: string }> };

async function weekOf(ctx: Ctx): Promise<string | null> {
  const week = (await ctx.params).week;
  return ISO_WEEK.test(week) ? week : null;
}

function serializeSlots(weekPlanId: number, isoWeek: string): Response {
  const slots = rows(
    `SELECT ms.day, ms.meal, ms.recipe_id AS recipeId, r.name AS recipeName
     FROM meal_slots ms LEFT JOIN recipes r ON r.id = ms.recipe_id
     WHERE ms.week_plan_id = ? ORDER BY ms.day, CASE ms.meal
       WHEN 'desayuno' THEN 0 WHEN 'almuerzo' THEN 1 ELSE 2 END`,
    weekPlanId,
  );
  // recipe_id may point at a cleared slot; LEFT JOIN keeps row, name null → empty render
  return json({ isoWeek, slots });
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const week = await weekOf(ctx);
    if (!week) return fail("week must match YYYY-Www (ISO)", "week");
    const plan = row("SELECT id FROM week_plans WHERE iso_week = ?", week);
    if (!plan) return json({ isoWeek: week, slots: [] });
    return serializeSlots(Number(plan.id), week);
  });
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const week = await weekOf(ctx);
    if (!week) return fail("week must match YYYY-Www (ISO)", "week");
    const parsed = await readValidated(req, mealPlanSchema);
    if (!parsed.ok) return parsed.res;
    const seen = new Set<string>();
    for (const s of parsed.data.slots) {
      const key = `${s.day}|${s.meal}`;
      if (seen.has(key)) return fail("Duplicate slot for same day and meal", "slots");
      seen.add(key);
    }
    const db = getDb();
    const planId = db.transaction(() => {
      db.prepare("INSERT OR IGNORE INTO week_plans (iso_week) VALUES (?)").run(week);
      const id = Number(row("SELECT id FROM week_plans WHERE iso_week = ?", week)?.id);
      db.prepare("DELETE FROM meal_slots WHERE week_plan_id = ?").run(id);
      const ins = db.prepare(
        "INSERT INTO meal_slots (week_plan_id, day, meal, recipe_id) VALUES (?, ?, ?, ?)",
      );
      for (const s of parsed.data.slots) ins.run(id, s.day, s.meal, s.recipeId ?? null);
      return id;
    })();
    return serializeSlots(planId, week);
  });
}
