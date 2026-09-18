// Cerrar el día: series de fuerza + marcas de cardio contra los ejercicios de la
// sesión; doble POST 409; logged solo lectura; last-values por ejercicio.
import { beforeAll, describe, expect, it } from "vitest";
import { d1, freshDb, get, post } from "./helpers";

beforeAll(freshDb);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

type Seed = {
  benchId: number;
  runId: number;
  sessionId: number;
  seBench: number;
  seCurl: number;
  seRun: number;
};

/** Sesión planificada con banca + curl (fuerza) y running (cardio). */
async function seed(date: string): Promise<Seed> {
  // reset so UNIQUE names do not collide between tests
  await d1.run("DELETE FROM cardio_logs");
  await d1.run("DELETE FROM set_logs");
  await d1.run("DELETE FROM workout_logs");
  await d1.run("DELETE FROM plan_session_exercises");
  await d1.run("DELETE FROM plan_sessions");
  await d1.run("DELETE FROM template_exercises");
  await d1.run("DELETE FROM session_templates");
  await d1.run("DELETE FROM exercises");
  const benchId = await d1.run(
    "INSERT INTO exercises (name) VALUES ('Press banca')",
  );
  const curlId = await d1.run("INSERT INTO exercises (name) VALUES ('Curl')");
  const runId = await d1.run(
    "INSERT INTO exercises (name, kind) VALUES ('Running', 'running')",
  );
  const res = await post("/api/plan-sessions", {
    date,
    name: "Empuje A",
    items: [
      { exerciseId: benchId, targetSets: 3 },
      { exerciseId: curlId, targetSets: 3 },
      { exerciseId: runId, targetDistanceKm: 5, targetDurationMin: 30 },
    ],
  });
  const created = (await body(res)) as {
    id: number;
    exercises: { id: number; exerciseId: number }[];
  };
  const byExercise = new Map(
    created.exercises.map((e) => [e.exerciseId, e.id]),
  );
  return {
    benchId,
    runId,
    sessionId: created.id,
    seBench: Number(byExercise.get(benchId)),
    seCurl: Number(byExercise.get(curlId)),
    seRun: Number(byExercise.get(runId)),
  };
}

describe("/api/workout-logs/:date", () => {
  it("cierra una sesión planificada con series + cardio → GET read-only", async () => {
    const s = await seed("2026-09-05");
    const res = await post("/api/workout-logs/2026-09-05", {
      effort: 3,
      note: "se sintió fuerte",
      sets: [
        {
          planSessionExerciseId: s.seBench,
          setIndex: 0,
          weightKg: 57.5,
          reps: 8,
          done: true,
        },
        {
          planSessionExerciseId: s.seBench,
          setIndex: 1,
          weightKg: 57.5,
          reps: 6,
          done: true,
        },
        {
          planSessionExerciseId: s.seCurl,
          setIndex: 0,
          weightKg: 20,
          reps: 12,
          done: false,
        },
      ],
      cardio: [
        {
          planSessionExerciseId: s.seRun,
          distanceKm: 5.2,
          durationMin: 32,
          done: true,
        },
      ],
    });
    expect(res.status).toBe(201);
    const got = await body(await get("/api/workout-logs/2026-09-05"));
    expect(got.status).toBe("logged"); // read-only marker
    expect(got.readOnly).toBe(true);
    expect(got.effort).toBe(3);
    expect(got.session).toEqual({ id: s.sessionId, name: "Empuje A" });
    const sets = got.sets as {
      exerciseName: string;
      weightKg: number;
      reps: number;
      done: boolean;
    }[];
    expect(sets.map((x) => x.exerciseName)).toEqual([
      "Press banca",
      "Press banca",
      "Curl",
    ]);
    expect(sets[0].weightKg).toBe(57.5);
    expect(sets[2].done).toBe(false);
    expect(got.cardio).toEqual([
      {
        planSessionExerciseId: s.seRun,
        exerciseName: "Running",
        distanceKm: 5.2,
        durationMin: 32,
        done: true,
      },
    ]);
    const ps = await d1.get<{ status: string }>(
      "SELECT status FROM plan_sessions WHERE date='2026-09-05'",
    );
    expect(ps?.status).toBe("logged");
  });

  it("cardio 'hecho' sin marcas → distancia y tiempo null", async () => {
    const s = await seed("2026-09-14");
    const res = await post("/api/workout-logs/2026-09-14", {
      effort: 2,
      sets: [],
      cardio: [{ planSessionExerciseId: s.seRun, done: true }],
    });
    expect(res.status).toBe(201);
    const got = await body(await get("/api/workout-logs/2026-09-14"));
    expect(got.cardio).toEqual([
      {
        planSessionExerciseId: s.seRun,
        exerciseName: "Running",
        distanceKm: null,
        durationMin: null,
        done: true,
      },
    ]);
  });

  it("409 on double close; first log unchanged", async () => {
    const s = await seed("2026-09-06");
    const good = {
      effort: 2,
      sets: [
        {
          planSessionExerciseId: s.seBench,
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
          planSessionExerciseId: s.seCurl,
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
    await seed("2026-09-08");
    const res = await post("/api/workout-logs/2026-09-08", {
      effort: 9,
      sets: [],
    });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("effort");
  });

  it("400 cuando el set apunta a un ejercicio de otra sesión", async () => {
    const s = await seed("2026-09-15");
    const other = await post("/api/plan-sessions", {
      date: "2026-09-16",
      items: [{ exerciseId: s.benchId }],
    });
    const otherSession = (await body(other)) as {
      exercises: { id: number }[];
    };
    const foreign = otherSession.exercises[0].id;
    const res = await post("/api/workout-logs/2026-09-15", {
      effort: 3,
      sets: [
        { planSessionExerciseId: foreign, setIndex: 0, reps: 8, done: true },
      ],
    });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("sets");
  });

  it("400 cuando un set apunta a un ejercicio de cardio (y viceversa)", async () => {
    const s = await seed("2026-09-17");
    expect(
      (
        await post("/api/workout-logs/2026-09-17", {
          effort: 3,
          sets: [
            {
              planSessionExerciseId: s.seRun,
              setIndex: 0,
              reps: 8,
              done: true,
            },
          ],
        })
      ).status,
    ).toBe(400);
    const res = await post("/api/workout-logs/2026-09-17", {
      effort: 3,
      sets: [],
      cardio: [{ planSessionExerciseId: s.seBench, done: true }],
    });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("cardio");
  });

  // E6 debt (design D3): clean break — snake_case wire names are rejected.
  it("400 on snake_case set fields; no workout_logs row created", async () => {
    const s = await seed("2026-09-11");
    const res = await post("/api/workout-logs/2026-09-11", {
      effort: 3,
      sets: [
        {
          planSessionExerciseId: s.seBench,
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
    const s = await seed("2026-09-12");
    const res = await post("/api/workout-logs/2026-09-12", {
      effort: 4,
      sets: [
        {
          planSessionExerciseId: s.seCurl,
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
    const older = await seed("2026-09-09");
    await post("/api/workout-logs/2026-09-09", {
      effort: 2,
      sets: [
        {
          planSessionExerciseId: older.seBench,
          setIndex: 0,
          weightKg: 55,
          reps: 8,
          done: true,
        },
      ],
    });
    // newer day wins (same exercise, new session)
    const newer = await seed("2026-09-10");
    await post("/api/workout-logs/2026-09-10", {
      effort: 3,
      sets: [
        {
          planSessionExerciseId: newer.seBench,
          setIndex: 0,
          weightKg: 57.5,
          reps: 8,
          done: true,
        },
      ],
    });
    const res = await get(`/api/exercises/${newer.benchId}/last`);
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
    const s = await seed("2026-09-13");
    await post("/api/workout-logs/2026-09-13", {
      effort: 2,
      sets: [
        {
          planSessionExerciseId: s.seBench,
          setIndex: 0,
          weightKg: 60,
          reps: 8,
          done: true,
        },
        // skipped set logged empty — must not poison prefill
        {
          planSessionExerciseId: s.seBench,
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
