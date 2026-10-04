// DELETE /api/plan-sessions/:id — planned→200 {}, logged→409 {error},
// inexistente→404 {error:"Not found"}. Seed directo por D1 + sesión por HTTP.
import { beforeAll, describe, expect, it } from "vitest";
import { d1, del, devSend, freshDb, post } from "./helpers";

beforeAll(freshDb);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Semilla mínima: un ejercicio; las sesiones se crean por HTTP. */
async function seed(): Promise<{ exerciseId: number }> {
  // reset so UNIQUE names do not collide between tests
  await d1.run("DELETE FROM cardio_logs");
  await d1.run("DELETE FROM set_logs");
  await d1.run("DELETE FROM workout_logs");
  await d1.run("DELETE FROM plan_session_exercises");
  await d1.run("DELETE FROM plan_sessions");
  await d1.run("DELETE FROM exercises");
  const exerciseId = await d1.run(
    "INSERT INTO exercises (name) VALUES ('Press banca')",
  );
  return { exerciseId };
}

async function plannedSession(
  exerciseId: number,
  date: string,
): Promise<number> {
  const res = await post("/api/plan-sessions", {
    date,
    items: [{ exerciseId, targetSets: 3 }],
  });
  const r = (await body(res)) as { id: number };
  return r.id;
}

/** Crea una sesión y la marca logged (cierra con workout_log por D1). */
async function loggedSession(
  exerciseId: number,
  date: string,
): Promise<number> {
  const id = await plannedSession(exerciseId, date);
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
    const id = await plannedSession(s.exerciseId, "2026-09-07");
    const res = await del(`/api/plan-sessions/${id}`);
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({});
    const row = await d1.get("SELECT id FROM plan_sessions WHERE id=?", id);
    expect(row).toBeNull();
    // El día queda libre de nuevo: puede planificarse otra vez.
    expect(
      (
        await post("/api/plan-sessions", {
          date: "2026-09-07",
          items: [{ exerciseId: s.exerciseId }],
        })
      ).status,
    ).toBe(201);
  });

  it("logged → 409 {error} y la fila permanece", async () => {
    const s = await seed();
    const id = await loggedSession(s.exerciseId, "2026-09-08");
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

  it("la sesión de otro usuario → 404 y no se borra", async () => {
    const s = await seed();
    const id = await plannedSession(s.exerciseId, "2026-09-09");
    const res = await devSend(
      `/api/plan-sessions/${id}`,
      "DELETE",
      null,
      "otro@esencial.test",
    );
    expect(res.status).toBe(404);
    expect((await body(res)).error).toBe("Not found");
    const row = await d1.get("SELECT id FROM plan_sessions WHERE id=?", id);
    expect(row).not.toBeNull();
  });
});
