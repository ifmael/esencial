// 6.1/6.2/6.3 RED+GREEN: schedule sessions, close with workout log (409 double),
// read-only after close, last-values per exercise.
import { afterAll, describe, expect, it } from "vitest";
import { useTempDb, call, get, post, put } from "../helpers";
import * as planSessions from "@/app/api/plan-sessions/route";
import * as logs from "@/app/api/workout-logs/[date]/route";
import * as lastValues from "@/app/api/exercises/[id]/last/route";
import { getDb } from "@/lib/db";

const cleanup = useTempDb();
afterAll(cleanup);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function insertedId(sql: string, ...args: unknown[]): number {
  return Number(getDb().prepare(sql).run(...(args as never[])).lastInsertRowid);
}

/** Seeds bench + curl exercises and an "Empuje A" template holding both. */
function seed(): { benchId: number; templateId: number; teBench: number; teCurl: number } {
  // reset so UNIQUE names do not collide between tests
  getDb().exec(
    "DELETE FROM set_logs; DELETE FROM workout_logs; DELETE FROM plan_sessions;" +
      " DELETE FROM template_exercises; DELETE FROM session_templates; DELETE FROM exercises;",
  );
  const benchId = insertedId("INSERT INTO exercises (name) VALUES ('Press banca')");
  const curlId = insertedId("INSERT INTO exercises (name) VALUES ('Curl')");
  const templateId = insertedId("INSERT INTO session_templates (name, rotation_index) VALUES ('Empuje A', 0)");
  const teBench = insertedId(
    "INSERT INTO template_exercises (template_id, exercise_id, position, target_sets) VALUES (?, ?, 0, 3)",
    templateId,
    benchId,
  );
  const teCurl = insertedId(
    "INSERT INTO template_exercises (template_id, exercise_id, position, target_sets) VALUES (?, ?, 1, 3)",
    templateId,
    curlId,
  );
  return { benchId, templateId, teBench, teCurl };
}

describe("/api/plan-sessions", () => {
  it("schedules a template on a date", async () => {
    const s = seed();
    const res = await call(planSessions.POST, post("/api/plan-sessions", {
      date: "2026-09-03",
      templateId: s.templateId,
    }));
    expect(res.status).toBe(201);
    const r = await body(res);
    expect(r.date).toBe("2026-09-03");
    expect(r.status).toBe("planned");
    expect(r.templateId).toBe(s.templateId);
  });

  it("409 on second schedule for the same date", async () => {
    const s = seed();
    await call(planSessions.POST, post("/api/plan-sessions", { date: "2026-09-04", templateId: s.templateId }));
    const res = await call(planSessions.POST, post("/api/plan-sessions", { date: "2026-09-04", templateId: s.templateId }));
    expect(res.status).toBe(409);
  });

  it("400 with invalid date or unknown template", async () => {
    const s = seed();
    expect((await call(planSessions.POST, post("/api/plan-sessions", { date: "03-09-2026", templateId: s.templateId }))).status).toBe(400);
    expect((await call(planSessions.POST, post("/api/plan-sessions", { date: "2026-12-25", templateId: 999999 }))).status).toBe(400);
  });
});

describe("/api/workout-logs/[date]", () => {
  it("closes a planned session with sets+effort → GET returns read-only log", async () => {
    const s = seed();
    await call(planSessions.POST, post("/api/plan-sessions", { date: "2026-09-05", templateId: s.templateId }));
    const res = await call(logs.POST, post("/api/workout-logs/2026-09-05", {
      effort: 3,
      note: "se sintió fuerte",
      sets: [
        { templateExerciseId: s.teBench, set_index: 0, weight_kg: 57.5, reps: 8, done: true },
        { templateExerciseId: s.teBench, set_index: 1, weight_kg: 57.5, reps: 6, done: true },
        { templateExerciseId: s.teCurl, set_index: 0, weight_kg: 20, reps: 12, done: false },
      ],
    }), { date: "2026-09-05" });
    expect(res.status).toBe(201);
    const got = await body(await call(logs.GET, get("/api/workout-logs/2026-09-05"), { date: "2026-09-05" }));
    expect(got.status).toBe("logged"); // read-only marker
    expect(got.effort).toBe(3);
    const sets = got.sets as { weightKg: number; reps: number; done: boolean }[];
    expect(sets.length).toBe(3);
    expect(sets[0].weightKg).toBe(57.5);
    // order is by set_index: bench0, curl0 (not done), bench1
    expect(sets[1].done).toBe(false);
    // the plan session flipped to logged
    const ps = getDb().prepare("SELECT status FROM plan_sessions WHERE date='2026-09-05'").get();
    expect(ps && typeof ps === "object" && "status" in ps ? ps.status : null).toBe("logged");
  });

  it("409 on double close; first log unchanged", async () => {
    const s = seed();
    await call(planSessions.POST, post("/api/plan-sessions", { date: "2026-09-06", templateId: s.templateId }));
    const good = { effort: 2, sets: [{ templateExerciseId: s.teBench, set_index: 0, weight_kg: 60, reps: 5, done: true }] };
    await call(logs.POST, post("/api/workout-logs/2026-09-06", good), { date: "2026-09-06" });
    const again = await call(logs.POST, post("/api/workout-logs/2026-09-06", {
      effort: 5, sets: [{ templateExerciseId: s.teCurl, set_index: 0, weight_kg: 99, reps: 1, done: true }],
    }), { date: "2026-09-06" });
    expect(again.status).toBe(409);
    const got = await body(await call(logs.GET, get("/api/workout-logs/2026-09-06"), { date: "2026-09-06" }));
    expect(got.effort).toBe(2);
    const sets = got.sets as { weightKg: number }[];
    expect(sets.length).toBe(1);
    expect(sets[0].weightKg).toBe(60);
  });

  it("404 when no session planned on that date", async () => {
    const res = await call(logs.POST, post("/api/workout-logs/2026-09-07", { effort: 3, sets: [] }), { date: "2026-09-07" });
    expect(res.status).toBe(404);
  });

  it("400 when effort out of 1-5", async () => {
    const s = seed();
    await call(planSessions.POST, post("/api/plan-sessions", { date: "2026-09-08", templateId: s.templateId }));
    const res = await call(logs.POST, post("/api/workout-logs/2026-09-08", { effort: 9, sets: [] }), { date: "2026-09-08" });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("effort");
  });

  it("GET unknown date → 404", async () => {
    const res = await call(logs.GET, get("/api/workout-logs/2020-01-01"), { date: "2020-01-01" });
    expect(res.status).toBe(404);
  });
});

describe("last values per exercise", () => {
  it("GET /api/exercises/[id]/last returns weight+reps of most recent logged set", async () => {
    const s = seed();
    // older day
    await call(planSessions.POST, post("/api/plan-sessions", { date: "2026-09-09", templateId: s.templateId }));
    await call(logs.POST, post("/api/workout-logs/2026-09-09", {
      effort: 2,
      sets: [{ templateExerciseId: s.teBench, set_index: 0, weight_kg: 55, reps: 8, done: true }],
    }), { date: "2026-09-09" });
    // newer day wins
    await call(planSessions.POST, post("/api/plan-sessions", { date: "2026-09-10", templateId: s.templateId }));
    await call(logs.POST, post("/api/workout-logs/2026-09-10", {
      effort: 3,
      sets: [{ templateExerciseId: s.teBench, set_index: 0, weight_kg: 57.5, reps: 8, done: true }],
    }), { date: "2026-09-10" });
    const res = await call(lastValues.GET, get(`/api/exercises/${s.benchId}/last`), { id: String(s.benchId) });
    expect(res.status).toBe(200);
    const r = await body(res);
    const last = r.last as { weightKg: number; reps: number; date: string };
    expect(last.weightKg).toBe(57.5);
    expect(last.reps).toBe(8);
    expect(last.date).toBe("2026-09-10");
  });

  it("no logs yet → last null", async () => {
    const id = insertedId("INSERT INTO exercises (name) VALUES ('Plank')");
    const res = await call(lastValues.GET, get(`/api/exercises/${id}/last`), { id: String(id) });
    expect(res.status).toBe(200);
    expect((await res.json()).last).toBeNull();
  });

  it("404 for unknown exercise", async () => {
    const res = await call(lastValues.GET, get("/api/exercises/999999/last"), { id: "999999" });
    expect(res.status).toBe(404);
  });
});
