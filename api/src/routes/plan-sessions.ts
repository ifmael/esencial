// /api/plan-sessions — schedule a template on a date (one session per date).
import { Hono } from "hono";
import { planSessionSchema } from "../api-validation";
import { type Env, getDb } from "../db";
import { fail, guard, json, parseId } from "../http";
import { row, rows } from "../repo";
import { zBody } from "../validation";

export const planSessions = new Hono<{ Bindings: Env }>()
  .get("/", (c) =>
    guard(async () => {
      const list = await rows(
        c.env.DB,
        `SELECT ps.id, ps.date, ps.status, ps.template_id AS templateId, st.name AS templateName
         FROM plan_sessions ps JOIN session_templates st ON st.id = ps.template_id
         ORDER BY ps.date`,
      );
      return json(list);
    }),
  )
  .post("/", zBody(planSessionSchema), (c) =>
    guard(async () => {
      const { date, templateId } = c.get("validated");
      const db = getDb(c.env);
      if (
        !(await row(
          db,
          "SELECT id FROM session_templates WHERE id = ?",
          templateId,
        ))
      )
        return fail("Unknown template", "templateId");
      if (await row(db, "SELECT id FROM plan_sessions WHERE date = ?", date))
        return fail("Ya hay una sesión ese día", "date", 409);
      const { meta } = await db
        .prepare(
          "INSERT INTO plan_sessions (date, template_id, status) VALUES (?, ?, 'planned')",
        )
        .bind(date, templateId)
        .run();
      return json(
        { id: Number(meta.last_row_id), date, templateId, status: "planned" },
        201,
      );
    }),
  )
  .delete("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (!id) return fail("Not found", undefined, 404);
      const db = getDb(c.env);
      const session = await row(
        db,
        "SELECT id, status FROM plan_sessions WHERE id = ?",
        id,
      );
      if (!session) return fail("Not found", undefined, 404);
      if (session.status === "logged")
        return fail("Sesión ya registrada", undefined, 409);
      await db.prepare("DELETE FROM plan_sessions WHERE id = ?").bind(id).run();
      return json({});
    }),
  );
