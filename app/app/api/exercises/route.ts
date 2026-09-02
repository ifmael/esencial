// GET /api/exercises (supports ?tag=) · POST /api/exercises
import { getDb } from "@/lib/db";
import { guard, json, readValidated } from "@/lib/api";
import { exerciseSchema } from "@/lib/api-validation";
import { loadExercise, rows } from "@/lib/repo";

export async function GET(req: Request): Promise<Response> {
  return guard(async () => {
    const tag = new URL(req.url).searchParams.get("tag");
    const ids = tag
      ? rows(
          "SELECT e.id FROM exercises e JOIN exercise_tags t ON t.exercise_id = e.id WHERE t.tag = ? ORDER BY e.name COLLATE NOCASE",
          tag,
        )
      : rows("SELECT id FROM exercises ORDER BY name COLLATE NOCASE");
    return json(ids.map((r) => loadExercise(Number(r.id))));
  });
}

export async function POST(req: Request): Promise<Response> {
  return guard(async () => {
    const parsed = await readValidated(req, exerciseSchema);
    if (!parsed.ok) return parsed.res;
    const input = parsed.data;
    const db = getDb();
    const id = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare("INSERT INTO exercises (name, description, setup_cues, technique_url) VALUES (?, ?, ?, ?)")
        .run(input.name.trim(), input.description ?? null, input.setup_cues ?? null, input.technique_url ?? null);
      const eid = Number(lastInsertRowid);
      const tag = db.prepare("INSERT INTO exercise_tags (exercise_id, tag) VALUES (?, ?)");
      for (const t of new Set(input.tags)) tag.run(eid, t);
      return eid;
    })();
    return json(loadExercise(id), 201);
  });
}
