// /api/notes/[date] — one editable note per day (PUT upserts, GET reads).
import { getDb } from "@/lib/db";
import { guard, json, fail, readValidated } from "@/lib/api";
import { dayNoteSchema } from "@/lib/api-validation";
import { row } from "@/lib/repo";

type Ctx = { params: Promise<{ date: string }> };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const date = (await ctx.params).date;
    if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
    const note = row("SELECT text FROM day_notes WHERE date = ?", date);
    const text = note && typeof note === "object" && "text" in note ? String(note.text ?? "") : "";
    return json({ date, text });
  });
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return guard(async () => {
    const date = (await ctx.params).date;
    if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
    const parsed = await readValidated(req, dayNoteSchema);
    if (!parsed.ok) return parsed.res;
    getDb()
      .prepare(
        `INSERT INTO day_notes (date, text) VALUES (?, ?)
         ON CONFLICT(date) DO UPDATE SET text = excluded.text`,
      )
      .run(date, parsed.data.text);
    return json({ date, text: parsed.data.text });
  });
}
