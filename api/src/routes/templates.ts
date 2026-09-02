// /api/templates — GET · POST · /:id GET/PUT/DELETE. PUT replaces ordered entries;
// absent rotation_index preserves the stored value (COALESCE, E1 parity).
import { Hono } from "hono";
import { getDb, type Env } from "../db";
import { guard, json, fail, parseId } from "../http";
import { templateSchema } from "../api-validation";
import { loadTemplate, row, rows } from "../repo";
import { zBody } from "../validation";

type Entry = {
  exerciseId: number;
  target_sets?: number | null;
  target_reps_min?: number | null;
  target_reps_max?: number | null;
};

// Ordered-entry INSERT builders (by-name subselect keeps POST atomic in one batch).
function entriesForNewTemplate(name: string, entries: Entry[], db: D1Database) {
  return entries.map((e, pos) =>
    db
      .prepare(
        `INSERT INTO template_exercises (template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max)
         VALUES ((SELECT id FROM session_templates WHERE name = ?), ?, ?, ?, ?, ?)`,
      )
      .bind(name, e.exerciseId, pos, e.target_sets ?? null, e.target_reps_min ?? null, e.target_reps_max ?? null),
  );
}

function entriesForTemplate(templateId: number, entries: Entry[], db: D1Database) {
  return entries.map((e, pos) =>
    db
      .prepare(
        `INSERT INTO template_exercises (template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(templateId, e.exerciseId, pos, e.target_sets ?? null, e.target_reps_min ?? null, e.target_reps_max ?? null),
  );
}

export const templates = new Hono<{ Bindings: Env }>()
  .get("/", (c) =>
    guard(async () => {
      const db = getDb(c.env);
      const ids = await rows(
        db,
        "SELECT id FROM session_templates ORDER BY rotation_index, name COLLATE NOCASE",
      );
      return json(await Promise.all(ids.map((r) => loadTemplate(db, Number(r.id)))));
    }),
  )
  .post("/", zBody(templateSchema), (c) =>
    guard(async () => {
      const input = c.get("validated");
      const db = getDb(c.env);
      const name = input.name.trim();
      const results = await db.batch([
        db.prepare("INSERT INTO session_templates (name, rotation_index) VALUES (?, ?)").bind(name, input.rotation_index ?? 0),
        ...entriesForNewTemplate(name, input.exercises, db),
      ]);
      return json(await loadTemplate(db, Number(results[0].meta.last_row_id)), 201);
    }),
  )
  .get("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const t = await loadTemplate(c.env.DB, id);
      return t ? json(t) : fail("Not found", undefined, 404);
    }),
  )
  .put("/:id", zBody(templateSchema), (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const input = c.get("validated");
      const db = getDb(c.env);
      if (!(await row(db, "SELECT id FROM session_templates WHERE id = ?", id)))
        return fail("Not found", undefined, 404);
      await db.batch([
        db
          .prepare("UPDATE session_templates SET name = ?, rotation_index = COALESCE(?, rotation_index) WHERE id = ?")
          .bind(input.name.trim(), input.rotation_index ?? null, id),
        db.prepare("DELETE FROM template_exercises WHERE template_id = ?").bind(id),
        ...entriesForTemplate(id, input.exercises, db),
      ]);
      return json(await loadTemplate(db, id));
    }),
  )
  .delete("/:id", (c) =>
    guard(async () => {
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const { meta } = await c.env.DB.prepare("DELETE FROM session_templates WHERE id=?").bind(id).run();
      return Number(meta.changes) > 0 ? new Response(null, { status: 204 }) : fail("Not found", undefined, 404);
    }),
  );
