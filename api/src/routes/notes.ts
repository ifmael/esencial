// /api/notes/:date — one editable note per day (PUT upserts, GET reads).
import { Hono } from "hono";
import { getDb, type Env } from "../db";
import { guard, json, fail } from "../http";
import { dayNoteSchema } from "../api-validation";
import { row } from "../repo";
import { zBody } from "../validation";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const notes = new Hono<{ Bindings: Env }>()
  .get("/:date", (c) =>
    guard(async () => {
      const date = c.req.param("date");
      if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
      const note = await row(
        c.env.DB,
        "SELECT text FROM day_notes WHERE date = ?",
        date,
      );
      const text =
        note && typeof note === "object" && "text" in note
          ? String(note.text ?? "")
          : "";
      return json({ date, text });
    }),
  )
  .put("/:date", zBody(dayNoteSchema), (c) =>
    guard(async () => {
      const date = c.req.param("date");
      if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
      const input = c.get("validated");
      await c.env.DB.prepare(
        `INSERT INTO day_notes (date, text) VALUES (?, ?)
         ON CONFLICT(date) DO UPDATE SET text = excluded.text`,
      )
        .bind(date, input.text)
        .run();
      return json({ date, text: input.text });
    }),
  );
