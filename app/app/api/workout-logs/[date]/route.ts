// /api/workout-logs/[date] — POST "Cerrar sesión": persists the log, flips the
// plan session to logged. A logged day is read-only: a second POST gets 409.
import { getDb } from "@/lib/db";
import { guard, json, fail, readValidated } from "@/lib/api";
import { workoutLogSchema } from "@/lib/api-validation";
import { loadTemplate, row, rows } from "@/lib/repo";

type Ctx = { params: Promise<{ date: string }> };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function sessionOn(date: string): Record<string, unknown> | undefined {
  return row(
    `SELECT ps.id, ps.date, ps.status, ps.template_id AS templateId
     FROM plan_sessions ps WHERE ps.date = ?`,
    date,
  );
}

function serialize(date: string, log: Record<string, unknown>, status = 200): Response {
  const raw = rows(
    `SELECT sl.set_index AS setIndex, sl.weight_kg AS weightKg, sl.reps, sl.done,
            sl.template_exercise_id AS templateExerciseId, e.name AS exerciseName
     FROM set_logs sl
     JOIN template_exercises te ON te.id = sl.template_exercise_id
     JOIN exercises e ON e.id = te.exercise_id
     WHERE sl.workout_log_id = ?
     ORDER BY sl.set_index, sl.id`,
    Number(log.id),
  );
  const sets = raw.map((s) => ({ ...s, done: Number(s.done) === 1 }));
  const session = sessionOn(date);
  const template = session ? loadTemplate(Number(session.templateId)) : null;
  return json(
    {
      date,
      status: "logged",
      readOnly: true,
      effort: log.effort,
      note: log.note,
      template: template ? { id: template.id, name: template.name } : null,
      sets,
    },
    status,
  );
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const date = (await ctx.params).date;
    if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
    const log = row("SELECT id, effort, note FROM workout_logs WHERE date = ?", date);
    if (!log) return fail("No workout logged for this date", "date", 404);
    return serialize(date, log);
  });
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const date = (await ctx.params).date;
    if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
    const parsed = await readValidated(req, workoutLogSchema);
    if (!parsed.ok) return parsed.res;
    const input = parsed.data;
    const session = sessionOn(date);
    if (!session) return fail("No session planned for this date", "date", 404);
    if (session.status === "logged") return fail("This day is already logged and read-only", "date", 409);
    const db = getDb();
    const templateId = Number(session.templateId);
    for (const s of input.sets) {
      const te = row(
        "SELECT id FROM template_exercises WHERE id = ? AND template_id = ?",
        s.templateExerciseId,
        templateId,
      );
      if (!te) return fail("Set references an exercise outside the planned template", "sets");
    }
    const logId = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare("INSERT INTO workout_logs (plan_session_id, date, effort, note) VALUES (?, ?, ?, ?)")
        .run(Number(session.id), date, input.effort, input.note ?? null);
      const lid = Number(lastInsertRowid);
      const ins = db.prepare(
        "INSERT INTO set_logs (workout_log_id, template_exercise_id, set_index, weight_kg, reps, done) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const s of input.sets)
        ins.run(lid, s.templateExerciseId, s.set_index, s.weight_kg ?? null, s.reps ?? null, s.done ? 1 : 0);
      db.prepare("UPDATE plan_sessions SET status = 'logged' WHERE id = ?").run(Number(session.id));
      return lid;
    })();
    const log = row("SELECT id, effort, note FROM workout_logs WHERE id = ?", logId);
    if (!log) return fail("No workout logged for this date", "date", 404);
    return serialize(date, log, 201);
  });
}
