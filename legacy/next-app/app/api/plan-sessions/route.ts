// /api/plan-sessions — schedule a template on a date (one session per date).
import { getDb } from "@/lib/db";
import { guard, json, fail, readValidated } from "@/lib/api";
import { planSessionSchema } from "@/lib/api-validation";
import { row, rows } from "@/lib/repo";

export async function GET(): Promise<Response> {
  return guard(async () => {
    return json(
      rows(
        `SELECT ps.id, ps.date, ps.status, ps.template_id AS templateId, st.name AS templateName
         FROM plan_sessions ps JOIN session_templates st ON st.id = ps.template_id
         ORDER BY ps.date`,
      ),
    );
  });
}

export async function POST(req: Request): Promise<Response> {
  return guard(async () => {
    const parsed = await readValidated(req, planSessionSchema);
    if (!parsed.ok) return parsed.res;
    const { date, templateId } = parsed.data;
    const db = getDb();
    if (!row("SELECT id FROM session_templates WHERE id = ?", templateId))
      return fail("Unknown template", "templateId");
    if (row("SELECT id FROM plan_sessions WHERE date = ?", date))
      return fail("A session is already scheduled for this date", "date", 409);
    const id = Number(
      db.prepare("INSERT INTO plan_sessions (date, template_id, status) VALUES (?, ?, 'planned')")
        .run(date, templateId).lastInsertRowid,
    );
    return json({ id, date, templateId, status: "planned" }, 201);
  });
}
