// /api/exercises/[id] — GET/PUT/DELETE
import { getDb } from "@/lib/db";
import { guard, json, fail, readValidated, parseId } from "@/lib/api";
import { exerciseSchema } from "@/lib/api-validation";
import { loadExercise } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx): Promise<number | null> {
  const raw = (await ctx.params).id;
  return parseId(raw);
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const id = await idOf(ctx);
    if (id === null) return fail("id must be a positive integer", "id");
    const ex = loadExercise(id);
    return ex ? json(ex) : fail("Not found", undefined, 404);
  });
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const id = await idOf(ctx);
    if (id === null) return fail("id must be a positive integer", "id");
    const parsed = await readValidated(req, exerciseSchema);
    if (!parsed.ok) return parsed.res;
    const input = parsed.data;
    const db = getDb();
    const ok = db.transaction(() => {
      const { changes } = db
        .prepare("UPDATE exercises SET name=?, description=?, setup_cues=?, technique_url=? WHERE id=?")
        .run(input.name.trim(), input.description ?? null, input.setup_cues ?? null, input.technique_url ?? null, id);
      if (changes === 0) return false;
      db.prepare("DELETE FROM exercise_tags WHERE exercise_id=?").run(id);
      const tag = db.prepare("INSERT INTO exercise_tags (exercise_id, tag) VALUES (?, ?)");
      for (const t of new Set(input.tags)) tag.run(id, t);
      return true;
    })();
    if (!ok) return fail("Not found", undefined, 404);
    return json(loadExercise(id));
  });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const id = await idOf(ctx);
    if (id === null) return fail("id must be a positive integer", "id");
    const { changes } = getDb().prepare("DELETE FROM exercises WHERE id=?").run(id);
    return changes > 0 ? new Response(null, { status: 204 }) : fail("Not found", undefined, 404);
  });
}
