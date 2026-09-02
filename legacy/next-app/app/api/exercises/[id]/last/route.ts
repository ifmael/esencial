// /api/exercises/[id]/last — design D5: dedicated endpoint (chosen over ?last=1).
// Returns weight+reps of the most recent logged set for that exercise, or { last: null }.
import { guard, json, fail, parseId } from "@/lib/api";
import { row } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const id = parseId((await ctx.params).id);
    if (id === null) return fail("id must be a positive integer", "id");
    if (!row("SELECT id FROM exercises WHERE id = ?", id)) return fail("Not found", undefined, 404);
    const last = row(
      `SELECT sl.weight_kg AS weightKg, sl.reps, wl.date
       FROM set_logs sl
       JOIN template_exercises te ON te.id = sl.template_exercise_id
       JOIN workout_logs wl ON wl.id = sl.workout_log_id
       WHERE te.exercise_id = ?
       ORDER BY wl.date DESC, sl.id DESC
       LIMIT 1`,
      id,
    );
    return json({ exerciseId: id, last: last ?? null });
  });
}
