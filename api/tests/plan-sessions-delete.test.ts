// TDD RED: DELETE /api/plan-sessions/:id (spec "Desprogramar sesión planned").
// planned→200 {}, logged→409 {error}, inexistente→404 {error:"Not found"}.
// Patrón de sessions-logs.test.ts: seed directo por D1 + helpers con sesión.
import { beforeAll, describe, expect, it } from "vitest";
import { d1, del, freshDb, post } from "./helpers";

beforeAll(freshDb);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Semilla mínima: una plantilla; el INSERT en plan_sessions por HTTP. */
async function seed(): Promise<{ templateId: number }> {
  // reset so UNIQUE names do not collide between tests
  await d1.run("DELETE FROM set_logs");
  await d1.run("DELETE FROM workout_logs");
  await d1.run("DELETE FROM plan_sessions");
  await d1.run("DELETE FROM template_exercises");
  await d1.run("DELETE FROM session_templates");
  const templateId = await d1.run(
    "INSERT INTO session_templates (name, rotation_index) VALUES ('Empuje A', 0)",
  );
  return { templateId };
}

async function plannedSession(
  templateId: number,
  date: string,
): Promise<number> {
  const res = await post("/api/plan-sessions", { date, templateId });
  const r = (await res.json()) as { id: number };
  return r.id;
}

/** Crea una sesión y la marca logged (cierra con workout_log por D1). */
async function loggedSession(
  templateId: number,
  date: string,
): Promise<number> {
  const id = await plannedSession(templateId, date);
  await d1.run(
    "INSERT INTO workout_logs (plan_session_id, date, effort) VALUES (?, ?, 2)",
    id,
    date,
  );
  await d1.run("UPDATE plan_sessions SET status='logged' WHERE id=?", id);
  return id;
}

describe("DELETE /api/plan-sessions/:id", () => {
  it("planned → 200 {} y la fila desaparece", async () => {
    const s = await seed();
    const id = await plannedSession(s.templateId, "2026-09-07");
    const res = await del(`/api/plan-sessions/${id}`);
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({});
    const row = await d1.get("SELECT id FROM plan_sessions WHERE id=?", id);
    expect(row).toBeNull();
    // El día queda libre de nuevo: puede programarse otra vez.
    expect(
      (
        await post("/api/plan-sessions", {
          date: "2026-09-07",
          templateId: s.templateId,
        })
      ).status,
    ).toBe(201);
  });

  it("logged → 409 {error} y la fila permanece", async () => {
    const s = await seed();
    const id = await loggedSession(s.templateId, "2026-09-08");
    const res = await del(`/api/plan-sessions/${id}`);
    expect(res.status).toBe(409);
    expect((await body(res)).error).toBeTruthy();
    const row = await d1.get("SELECT id FROM plan_sessions WHERE id=?", id);
    expect(row).not.toBeNull();
  });

  it("inexistente → 404 {error:'Not found'}", async () => {
    const res = await del("/api/plan-sessions/999999");
    expect(res.status).toBe(404);
    expect((await body(res)).error).toBe("Not found");
  });
});
