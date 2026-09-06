// E1 parity: schedule sessions, close with workout log (409 double), read-only
// after close, last-values per exercise.
import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, d1, get, post, put } from "./helpers";

beforeAll(freshDb);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Seeds bench + curl exercises and an "Empuje A" template holding both. */
async function seed(): Promise<{
  benchId: number;
  templateId: number;
  teBench: number;
  teCurl: number;
}> {
  // reset so UNIQUE names do not collide between tests
  await d1.run("DELETE FROM set_logs");
  await d1.run("DELETE FROM workout_logs");
  await d1.run("DELETE FROM plan_sessions");
  await d1.run("DELETE FROM template_exercises");
  await d1.run("DELETE FROM session_templates");
  await d1.run("DELETE FROM exercises");
  const benchId = await d1.run(
    "INSERT INTO exercises (name) VALUES ('Press banca')",
  );
  const curlId = await d1.run("INSERT INTO exercises (name) VALUES ('Curl')");
  const templateId = await d1.run(
    "INSERT INTO session_templates (name, rotation_index) VALUES ('Empuje A', 0)",
  );
  const teBench = await d1.run(
    "INSERT INTO template_exercises (template_id, exercise_id, position, target_sets) VALUES (?, ?, 0, 3)",
    templateId,
    benchId,
  );
  const teCurl = await d1.run(
    "INSERT INTO template_exercises (template_id, exercise_id, position, target_sets) VALUES (?, ?, 1, 3)",
    templateId,
    curlId,
  );
  return { benchId, templateId, teBench, teCurl };
}

describe("/api/plan-sessions", () => {
  it("schedules a template on a date", async () => {
    const s = await seed();
    const res = await post("/api/plan-sessions", {
      date: "2026-09-03",
      templateId: s.templateId,
    });
    expect(res.status).toBe(201);
    const r = await body(res);
    expect(r.date).toBe("2026-09-03");
    expect(r.status).toBe("planned");
    expect(r.templateId).toBe(s.templateId);
  });

  it("409 on second schedule for the same date", async () => {
    const s = await seed();
    await post("/api/plan-sessions", {
      date: "2026-09-04",
      templateId: s.templateId,
    });
    const res = await post("/api/plan-sessions", {
      date: "2026-09-04",
      templateId: s.templateId,
    });
    expect(res.status).toBe(409);
  });

  it("400 with invalid date or unknown template", async () => {
    const s = await seed();
    expect(
      (
        await post("/api/plan-sessions", {
          date: "03-09-2026",
          templateId: s.templateId,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post("/api/plan-sessions", {
          date: "2026-12-25",
          templateId: 999999,
        })
      ).status,
    ).toBe(400);
  });
});

describe("/api/workout-logs/:date", () => {
  it("closes a planned session with sets+effort → GET returns read-only log", async () => {
    const s = await seed();
    await post("/api/plan-sessions", {
      date: "2026-09-05",
      templateId: s.templateId,
    });
    const res = await post("/api/workout-logs/2026-09-05", {
      effort: 3,
      note: "se sintió fuerte",
      sets: [
        {
          templateExerciseId: s.teBench,
          setIndex: 0,
          weightKg: 57.5,
          reps: 8,
          done: true,
        },
        {
          templateExerciseId: s.teBench,
          setIndex: 1,
          weightKg: 57.5,
          reps: 6,
          done: true,
        },
        {
          templateExerciseId: s.teCurl,
          setIndex: 0,
          weightKg: 20,
          reps: 12,
          done: false,
        },
      ],
    });
    expect(res.status).toBe(201);
    const got = await body(await get("/api/workout-logs/2026-09-05"));
    expect(got.status).toBe("logged"); // read-only marker
    expect(got.readOnly).toBe(true);
    expect(got.effort).toBe(3);
    const sets = got.sets as {
      weightKg: number;
      reps: number;
      done: boolean;
    }[];
    expect(sets.length).toBe(3);
    expect(sets[0].weightKg).toBe(57.5);
    // order is by set_index: bench0, curl0 (not done), bench1
    expect(sets[1].done).toBe(false);
    // the plan session flipped to logged
    const ps = await d1.get<{ status: string }>(
      "SELECT status FROM plan_sessions WHERE date='2026-09-05'",
    );
    expect(ps?.status).toBe("logged");
  });

  it("409 on double close; first log unchanged", async () => {
    const s = await seed();
    await post("/api/plan-sessions", {
      date: "2026-09-06",
      templateId: s.templateId,
    });
    const good = {
      effort: 2,
      sets: [
        {
          templateExerciseId: s.teBench,
          setIndex: 0,
          weightKg: 60,
          reps: 5,
          done: true,
        },
      ],
    };
    await post("/api/workout-logs/2026-09-06", good);
    const again = await post("/api/workout-logs/2026-09-06", {
      effort: 5,
      sets: [
        {
          templateExerciseId: s.teCurl,
          setIndex: 0,
          weightKg: 99,
          reps: 1,
          done: true,
        },
      ],
    });
    expect(again.status).toBe(409);
    const got = await body(await get("/api/workout-logs/2026-09-06"));
    expect(got.effort).toBe(2);
    const sets = got.sets as { weightKg: number }[];
    expect(sets.length).toBe(1);
    expect(sets[0].weightKg).toBe(60);
  });

  it("404 when no session planned on that date", async () => {
    const res = await post("/api/workout-logs/2026-09-07", {
      effort: 3,
      sets: [],
    });
    expect(res.status).toBe(404);
  });

  it("400 when effort out of 1-5", async () => {
    const s = await seed();
    await post("/api/plan-sessions", {
      date: "2026-09-08",
      templateId: s.templateId,
    });
    const res = await post("/api/workout-logs/2026-09-08", {
      effort: 9,
      sets: [],
    });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("effort");
  });

  // E6 debt (design D3): clean break — snake_case wire names are rejected.
  it("400 on snake_case set fields; no workout_logs row created", async () => {
    const s = await seed();
    await post("/api/plan-sessions", {
      date: "2026-09-11",
      templateId: s.templateId,
    });
    const res = await post("/api/workout-logs/2026-09-11", {
      effort: 3,
      sets: [
        {
          templateExerciseId: s.teBench,
          set_index: 0,
          weight_kg: 60,
          reps: 8,
          done: true,
        },
      ],
    });
    expect(res.status).toBe(400);
    const r = await body(res);
    // the error must reference the missing camelCase key, not the old name
    expect(String(r.field)).toContain("setIndex");
    expect(String(r.field)).not.toContain("set_index");
    const count = await d1.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM workout_logs",
    );
    expect(count?.n).toBe(0);
    const ps = await d1.get<{ status: string }>(
      "SELECT status FROM plan_sessions WHERE date='2026-09-11'",
    );
    expect(ps?.status).toBe("planned");
  });

  // Contract lock (task 1.3): POST response echoes the camelCase wire shape.
  it("POST 201 response echoes setIndex/weightKg/done:boolean camelCase", async () => {
    const s = await seed();
    await post("/api/plan-sessions", {
      date: "2026-09-12",
      templateId: s.templateId,
    });
    const res = await post("/api/workout-logs/2026-09-12", {
      effort: 4,
      sets: [
        {
          templateExerciseId: s.teCurl,
          setIndex: 0,
          weightKg: 20,
          reps: 12,
          done: true,
        },
      ],
    });
    expect(res.status).toBe(201);
    const r = await body(res);
    const sets = r.sets as Record<string, unknown>[];
    expect(sets[0].setIndex).toBe(0);
    expect(sets[0].weightKg).toBe(20);
    expect(sets[0].done).toBe(true);
    expect(sets[0]).not.toHaveProperty("set_index");
    expect(sets[0]).not.toHaveProperty("weight_kg");
  });

  it("GET unknown date → 404", async () => {
    expect((await get("/api/workout-logs/2020-01-01")).status).toBe(404);
  });
});

describe("last values per exercise", () => {
  it("GET /api/exercises/:id/last returns weight+reps of most recent logged set", async () => {
    const s = await seed();
    // older day
    await post("/api/plan-sessions", {
      date: "2026-09-09",
      templateId: s.templateId,
    });
    await post("/api/workout-logs/2026-09-09", {
      effort: 2,
      sets: [
        {
          templateExerciseId: s.teBench,
          setIndex: 0,
          weightKg: 55,
          reps: 8,
          done: true,
        },
      ],
    });
    // newer day wins
    await post("/api/plan-sessions", {
      date: "2026-09-10",
      templateId: s.templateId,
    });
    await post("/api/workout-logs/2026-09-10", {
      effort: 3,
      sets: [
        {
          templateExerciseId: s.teBench,
          setIndex: 0,
          weightKg: 57.5,
          reps: 8,
          done: true,
        },
      ],
    });
    const res = await get(`/api/exercises/${s.benchId}/last`);
    expect(res.status).toBe(200);
    const r = await body(res);
    const last = r.last as { weightKg: number; reps: number; date: string };
    expect(last.weightKg).toBe(57.5);
    expect(last.reps).toBe(8);
    expect(last.date).toBe("2026-09-10");
  });

  it("no logs yet → last null", async () => {
    const id = await d1.run("INSERT INTO exercises (name) VALUES ('Plank')");
    const res = await get(`/api/exercises/${id}/last`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { last: unknown }).last).toBeNull();
  });

  it("skips logged sets without weight/reps (E6 smoke)", async () => {
    const s = await seed();
    await post("/api/plan-sessions", {
      date: "2026-09-13",
      templateId: s.templateId,
    });
    await post("/api/workout-logs/2026-09-13", {
      effort: 2,
      sets: [
        {
          templateExerciseId: s.teBench,
          setIndex: 0,
          weightKg: 60,
          reps: 8,
          done: true,
        },
        // skipped set logged empty — must not poison prefill
        {
          templateExerciseId: s.teBench,
          setIndex: 1,
          weightKg: null,
          reps: null,
          done: false,
        },
      ],
    });
    const r = await body(await get(`/api/exercises/${s.benchId}/last`));
    const last = r.last as { weightKg: number; reps: number };
    expect(last.weightKg).toBe(60);
    expect(last.reps).toBe(8);
  });

  it("404 for unknown exercise", async () => {
    expect((await get("/api/exercises/999999/last")).status).toBe(404);
  });
});
