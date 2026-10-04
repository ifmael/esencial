// /api/notes/:date — una nota editable por usuario y día (privada: PUT upsert,
// GET lee; dos personas pueden tener nota el mismo día).
import { Hono } from "hono";
import { dayNoteSchema } from "../api-validation";
import type { AppContext } from "../db";
import { fail, guard, json } from "../http";
import { row } from "../repo";
import { zBody } from "../validation";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const notes = new Hono<AppContext>()
  .get("/:date", (c) =>
    guard(async () => {
      const date = c.req.param("date");
      if (!DATE.test(date)) return fail("date must be YYYY-MM-DD", "date");
      const note = await row(
        c.env.DB,
        "SELECT text FROM day_notes WHERE user_id = ? AND date = ?",
        c.get("user").id,
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
        `INSERT INTO day_notes (user_id, date, text) VALUES (?, ?, ?)
         ON CONFLICT(user_id, date) DO UPDATE SET text = excluded.text`,
      )
        .bind(c.get("user").id, date, input.text)
        .run();
      return json({ date, text: input.text });
    }),
  );
