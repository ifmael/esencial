// /api/templates/[id] — GET/PUT/DELETE. PUT replaces ordered entries;
// absent rotation_index preserves the stored value.
import { getDb } from "@/lib/db";
import { guard, json, fail, readValidated, parseId } from "@/lib/api";
import { templateSchema } from "@/lib/api-validation";
import { loadTemplate } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const id = parseId((await ctx.params).id);
    if (id === null) return fail("id must be a positive integer", "id");
    const t = loadTemplate(id);
    return t ? json(t) : fail("Not found", undefined, 404);
  });
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const id = parseId((await ctx.params).id);
    if (id === null) return fail("id must be a positive integer", "id");
    const parsed = await readValidated(req, templateSchema);
    if (!parsed.ok) return parsed.res;
    const input = parsed.data;
    const db = getDb();
    const ok = db.transaction(() => {
      const { changes } = db
        .prepare(
          `UPDATE session_templates
           SET name = ?,
               rotation_index = COALESCE(?, rotation_index)
           WHERE id = ?`,
        )
        .run(input.name.trim(), input.rotation_index ?? null, id);
      if (changes === 0) return false;
      db.prepare("DELETE FROM template_exercises WHERE template_id = ?").run(id);
      const ins = db.prepare(
        `INSERT INTO template_exercises (template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      input.exercises.forEach((e, pos) =>
        ins.run(id, e.exerciseId, pos, e.target_sets ?? null, e.target_reps_min ?? null, e.target_reps_max ?? null),
      );
      return true;
    })();
    if (!ok) return fail("Not found", undefined, 404);
    return json(loadTemplate(id));
  });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const id = parseId((await ctx.params).id);
    if (id === null) return fail("id must be a positive integer", "id");
    const { changes } = getDb().prepare("DELETE FROM session_templates WHERE id=?").run(id);
    return changes > 0 ? new Response(null, { status: 204 }) : fail("Not found", undefined, 404);
  });
}
