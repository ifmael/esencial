// GET /api/templates · POST /api/templates
import { getDb } from "@/lib/db";
import { guard, json, readValidated } from "@/lib/api";
import { templateSchema } from "@/lib/api-validation";
import { loadTemplate, rows } from "@/lib/repo";
function insertEntries(templateId: number, entries: { exerciseId: number; target_sets?: number | null; target_reps_min?: number | null; target_reps_max?: number | null }[]): void {
  const db = getDb();
  const ins = db.prepare(
    `INSERT INTO template_exercises (template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  entries.forEach((e, pos) =>
    ins.run(templateId, e.exerciseId, pos, e.target_sets ?? null, e.target_reps_min ?? null, e.target_reps_max ?? null),
  );
}

export async function GET(): Promise<Response> {
  return guard(async () => {
    const ids = rows("SELECT id FROM session_templates ORDER BY rotation_index, name COLLATE NOCASE");
    return json(ids.map((r) => loadTemplate(Number(r.id))));
  });
}

export async function POST(req: Request): Promise<Response> {
  return guard(async () => {
    const parsed = await readValidated(req, templateSchema);
    if (!parsed.ok) return parsed.res;
    const input = parsed.data;
    const db = getDb();
    const id = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare("INSERT INTO session_templates (name, rotation_index) VALUES (?, ?)")
        .run(input.name.trim(), input.rotation_index ?? 0);
      const tid = Number(lastInsertRowid);
      insertEntries(tid, input.exercises);
      return tid;
    })();
    return json(loadTemplate(id), 201);
  });
}
