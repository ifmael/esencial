// Sesiones por día: la sesión es el día (nombre + ejercicios expandidos, sin
// duplicados), creada y reemplazada con items de fuerza y/o cardio.
import { beforeAll, describe, expect, it } from "vitest";
import { d1, del, devGet, devSend, freshDb, get, post, put } from "./helpers";

beforeAll(freshDb);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

type Item = Record<string, unknown> & { exerciseId: number; id: number };

async function seed(): Promise<{ bench: number; run: number }> {
  await d1.run("DELETE FROM set_logs");
  await d1.run("DELETE FROM cardio_logs");
  await d1.run("DELETE FROM workout_logs");
  await d1.run("DELETE FROM plan_session_exercises");
  await d1.run("DELETE FROM plan_sessions");
  await d1.run("DELETE FROM exercises");
  const bench = await d1.run(
    "INSERT INTO exercises (name) VALUES ('Press banca')",
  );
  const run = await d1.run(
    "INSERT INTO exercises (name, kind) VALUES ('Running', 'running')",
  );
  return { bench, run };
}

describe("POST /api/plan-sessions", () => {
  it("crea la sesión del día con fuerza + cardio y GET /:id la expande ordenada", async () => {
    const { bench, run } = await seed();
    const res = await post("/api/plan-sessions", {
      date: "2026-10-05",
      name: "Empuje + cardio",
      items: [
        {
          exerciseId: bench,
          targetSets: 4,
          targetRepsMin: 8,
          targetRepsMax: 10,
        },
        { exerciseId: run, targetDistanceKm: 5, targetDurationMin: 30 },
      ],
    });
    expect(res.status).toBe(201);
    const created = (await body(res)) as {
      id: number;
      date: string;
      name: string;
      status: string;
    };
    expect(created.date).toBe("2026-10-05");
    expect(created.name).toBe("Empuje + cardio");
    expect(created.status).toBe("planned");

    const detail = await get(`/api/plan-sessions/${created.id}`);
    expect(detail.status).toBe(200);
    const d = (await body(detail)) as {
      name: string;
      status: string;
      exercises: Item[];
    };
    expect(d.exercises.map((e) => e.exerciseId)).toEqual([bench, run]);
    expect(d.exercises[0]).toMatchObject({
      exerciseName: "Press banca",
      kind: "strength",
      position: 0,
      targetSets: 4,
      targetRepsMin: 8,
      targetRepsMax: 10,
      targetDistanceKm: null,
      targetDurationMin: null,
    });
    expect(d.exercises[1]).toMatchObject({
      exerciseName: "Running",
      kind: "running",
      position: 1,
      targetDistanceKm: 5,
      targetDurationMin: 30,
    });
  });

  it("rechaza un ejercicio repetido en el día (400 field items)", async () => {
    const { bench } = await seed();
    const res = await post("/api/plan-sessions", {
      date: "2026-10-06",
      items: [{ exerciseId: bench }, { exerciseId: bench }],
    });
    expect(res.status).toBe(400);
    const b = (await body(res)) as { field?: string };
    expect(b.field).toBe("items");
  });

  it("rechaza un ejercicio inexistente (400 field items)", async () => {
    const res = await post("/api/plan-sessions", {
      date: "2026-10-07",
      items: [{ exerciseId: 999999 }],
    });
    expect(res.status).toBe(400);
    const b = (await body(res)) as { field?: string };
    expect(b.field).toBe("items");
  });

  it("409 si el día ya tiene sesión", async () => {
    const { bench } = await seed();
    await post("/api/plan-sessions", {
      date: "2026-10-08",
      items: [{ exerciseId: bench }],
    });
    const res = await post("/api/plan-sessions", {
      date: "2026-10-08",
      items: [{ exerciseId: bench }],
    });
    expect(res.status).toBe(409);
  });

  it("400 si no hay items", async () => {
    const res = await post("/api/plan-sessions", {
      date: "2026-10-09",
      items: [],
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/plan-sessions/:id", () => {
  it("reemplaza nombre e items", async () => {
    const { bench, run } = await seed();
    const created = (await body(
      await post("/api/plan-sessions", {
        date: "2026-10-12",
        items: [{ exerciseId: bench, targetSets: 3 }],
      }),
    )) as { id: number };

    const res = await put(`/api/plan-sessions/${created.id}`, {
      name: "Cardio día",
      items: [{ exerciseId: run, targetDistanceKm: 8 }],
    });
    expect(res.status).toBe(200);
    const d = (await body(res)) as { name: string; exercises: Item[] };
    expect(d.name).toBe("Cardio día");
    expect(d.exercises).toHaveLength(1);
    expect(d.exercises[0]).toMatchObject({
      exerciseId: run,
      targetDistanceKm: 8,
    });
  });

  it("conserva el id de los items que siguen y borra los que ya no están", async () => {
    const { bench, run } = await seed();
    const created = (await body(
      await post("/api/plan-sessions", {
        date: "2026-10-10",
        items: [
          { exerciseId: bench, targetSets: 4 },
          { exerciseId: run, targetDistanceKm: 5 },
        ],
      }),
    )) as { id: number };
    // Otra sesión después: su rowid queda por delante y delata un reinsert.
    await post("/api/plan-sessions", {
      date: "2026-10-11",
      items: [{ exerciseId: run }],
    });
    const before = (await body(
      await get(`/api/plan-sessions/${created.id}`),
    )) as { exercises: Item[] };
    const benchItem = before.exercises.find((e) => e.exerciseId === bench);

    const res = await put(`/api/plan-sessions/${created.id}`, {
      items: [{ exerciseId: bench, targetSets: 6 }],
    });
    expect(res.status).toBe(200);
    const after = (await body(res)) as { exercises: Item[] };
    // El registro del día cuelga de estos ids: reemplazarlos perdiendo la serie.
    expect(after.exercises).toHaveLength(1);
    expect(after.exercises[0]).toMatchObject({
      id: benchItem?.id,
      exerciseId: bench,
      targetSets: 6,
    });
  });

  it("200 sobre una sesión registrada si solo cambia el recuento de series", async () => {
    const { bench } = await seed();
    const created = (await body(
      await post("/api/plan-sessions", {
        date: "2026-10-13",
        name: "Empuje A",
        items: [{ exerciseId: bench, targetSets: 3, targetRepsMin: 8 }],
      }),
    )) as { id: number };
    const item = await d1.get(
      "SELECT id FROM plan_session_exercises WHERE plan_session_id=?",
      created.id,
    );
    await d1.run(
      "INSERT INTO workout_logs (plan_session_id, date, effort) VALUES (?, ?, 3)",
      created.id,
      "2026-10-13",
    );
    await d1.run(
      "UPDATE plan_sessions SET status='logged' WHERE id=?",
      created.id,
    );
    await d1.run(
      "INSERT INTO set_logs (workout_log_id, plan_session_exercise_id, set_index, reps) VALUES ((SELECT id FROM workout_logs WHERE plan_session_id=?), ?, 0, 8)",
      created.id,
      item?.id,
    );

    const res = await put(`/api/plan-sessions/${created.id}`, {
      name: "Empuje A",
      items: [{ exerciseId: bench, targetSets: 5, targetRepsMin: 8 }],
    });
    expect(res.status).toBe(200);
    const d = (await body(res)) as { exercises: Item[] };
    expect(d.exercises[0]).toMatchObject({ id: item?.id, targetSets: 5 });
    const keeps = await d1.get(
      "SELECT plan_session_exercise_id FROM set_logs WHERE set_index=0",
    );
    expect(keeps?.plan_session_exercise_id).toBe(item?.id);
  });

  it("409 sobre una sesión registrada si cambia la lista o algo más que las series", async () => {
    const { bench, run } = await seed();
    const created = (await body(
      await post("/api/plan-sessions", {
        date: "2026-10-14",
        name: "Empuje A",
        items: [
          { exerciseId: bench, targetSets: 3, targetRepsMin: 8 },
          { exerciseId: run },
        ],
      }),
    )) as { id: number };
    await d1.run(
      "INSERT INTO workout_logs (plan_session_id, date, effort) VALUES (?, ?, 3)",
      created.id,
      "2026-10-14",
    );
    await d1.run(
      "UPDATE plan_sessions SET status='logged' WHERE id=?",
      created.id,
    );

    const base = [
      { exerciseId: bench, targetSets: 3, targetRepsMin: 8 },
      { exerciseId: run },
    ];
    const cases: [string, { name?: string; items: unknown[] }][] = [
      ["otro ejercicio", { items: [base[1], base[0]] }],
      ["un ejercicio menos", { items: [base[0]] }],
      [
        "otro objetivo de reps",
        {
          items: [
            { exerciseId: bench, targetSets: 3, targetRepsMin: 10 },
            base[1],
          ],
        },
      ],
      ["otro nombre", { name: "Otra cosa", items: base }],
    ];
    for (const [what, payload] of cases) {
      const res = await put(`/api/plan-sessions/${created.id}`, payload);
      expect(res.status, what).toBe(409);
    }
    const after = (await body(
      await get(`/api/plan-sessions/${created.id}`),
    )) as { exercises: Item[] };
    expect(after.exercises.map((e) => e.exerciseId)).toEqual([bench, run]);
  });

  it("404 si no existe", async () => {
    const res = await put("/api/plan-sessions/999999", {
      items: [{ exerciseId: 1 }],
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/plan-sessions", () => {
  it("lista las sesiones con nombre, estado y sus ejercicios (desglose)", async () => {
    const { bench, run } = await seed();
    await post("/api/plan-sessions", {
      date: "2026-10-14",
      name: "Pierna",
      items: [{ exerciseId: bench }],
    });
    await post("/api/plan-sessions", {
      date: "2026-10-13",
      items: [
        { exerciseId: run, targetDistanceKm: 8 },
        { exerciseId: bench, targetSets: 5, targetRepsMin: 5 },
      ],
    });
    const res = await get("/api/plan-sessions");
    const list = (await res.json()) as {
      id: number;
      date: string;
      name: string | null;
      status: string;
      exercises: Item[];
    }[];
    expect(list.map((s) => s.date)).toEqual(["2026-10-13", "2026-10-14"]);
    expect(list[0]).toMatchObject({ name: null, status: "planned" });
    // Los ejercicios llegan ordenados por posición, listos para pintar el plan.
    expect(list[0].exercises.map((e) => e.exerciseId)).toEqual([run, bench]);
    expect(list[0].exercises[0]).toMatchObject({
      exerciseName: "Running",
      kind: "running",
      position: 0,
      targetDistanceKm: 8,
      targetDurationMin: null,
    });
    expect(list[1]).toEqual({
      id: expect.any(Number),
      date: "2026-10-14",
      name: "Pierna",
      status: "planned",
      exercises: [
        expect.objectContaining({
          exerciseId: bench,
          exerciseName: "Press banca",
          kind: "strength",
          position: 0,
        }),
      ],
    });
  });

  it("404 en detalle inexistente y 400 con id inválido", async () => {
    expect((await get("/api/plan-sessions/999999")).status).toBe(404);
    expect((await get("/api/plan-sessions/abc")).status).toBe(400);
  });
});

describe("DELETE /api/plan-sessions/:id", () => {
  it("borra solo la sesión y sus ejercicios quedan fuera", async () => {
    const { bench } = await seed();
    const created = (await body(
      await post("/api/plan-sessions", {
        date: "2026-10-15",
        items: [{ exerciseId: bench }],
      }),
    )) as { id: number };
    expect((await del(`/api/plan-sessions/${created.id}`)).status).toBe(200);
    const count = await d1.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM plan_session_exercises",
    );
    expect(count?.count).toBe(0);
  });
});

describe("descansos por ejercicio", () => {
  it("POST los guarda y GET los devuelve (null si no)", async () => {
    const { bench, run } = await seed();
    const created = (await body(
      await post("/api/plan-sessions", {
        date: "2026-11-02",
        items: [
          {
            exerciseId: bench,
            targetSets: 3,
            restSecs: 90,
            restAfterSecs: 180,
          },
          { exerciseId: run, targetDistanceKm: 5 },
        ],
      }),
    )) as { id: number };
    const d = (await body(await get(`/api/plan-sessions/${created.id}`))) as {
      exercises: Item[];
    };
    expect(d.exercises[0]).toMatchObject({ restSecs: 90, restAfterSecs: 180 });
    expect(d.exercises[1]).toMatchObject({
      restSecs: null,
      restAfterSecs: null,
    });
  });

  it("el PUT los reemplaza como el resto de objetivos", async () => {
    const { bench } = await seed();
    const created = (await body(
      await post("/api/plan-sessions", {
        date: "2026-11-03",
        items: [{ exerciseId: bench, restSecs: 60 }],
      }),
    )) as { id: number };
    const res = await put(`/api/plan-sessions/${created.id}`, {
      items: [{ exerciseId: bench, targetSets: 5 }],
    });
    expect(res.status).toBe(200);
    const d = (await body(res)) as { exercises: Item[] };
    expect(d.exercises[0]).toMatchObject({ targetSets: 5, restSecs: null });
  });

  it("400 con un descanso fuera de rango (field items.0.restAfterSecs)", async () => {
    const { bench } = await seed();
    const res = await post("/api/plan-sessions", {
      date: "2026-11-04",
      items: [{ exerciseId: bench, restAfterSecs: 99999 }],
    });
    expect(res.status).toBe(400);
    const b = (await body(res)) as { field?: string };
    expect(b.field).toBe("items.0.restAfterSecs");
  });

  it("en una sesión registrada los descansos no cambian (409)", async () => {
    const { bench } = await seed();
    const created = (await body(
      await post("/api/plan-sessions", {
        date: "2026-11-05",
        items: [{ exerciseId: bench, targetSets: 3, restSecs: 90 }],
      }),
    )) as { id: number };
    await d1.run(
      "INSERT INTO workout_logs (plan_session_id, date, effort) VALUES (?, ?, 3)",
      created.id,
      "2026-11-05",
    );
    await d1.run(
      "UPDATE plan_sessions SET status='logged' WHERE id=?",
      created.id,
    );
    const res = await put(`/api/plan-sessions/${created.id}`, {
      items: [{ exerciseId: bench, targetSets: 3, restSecs: 120 }],
    });
    expect(res.status).toBe(409);
  });
});

/** Segundo usuario de dev (familia propia): el plan de fuerza es privado. */
const OTRO = "otro@esencial.test";

describe("aislamiento del plan de fuerza", () => {
  it("B no ve ni toca la sesión de A: 404 por id y su lista va aparte", async () => {
    const { bench } = await seed();
    const a = (await body(
      await post("/api/plan-sessions", {
        date: "2026-12-01",
        name: "De A",
        items: [{ exerciseId: bench, targetSets: 3 }],
      }),
    )) as { id: number };

    // B no la lista, no la lee, no la edita y no la borra.
    const suyas = (await (
      await devGet("/api/plan-sessions", OTRO)
    ).json()) as unknown[];
    expect(suyas).toEqual([]);
    expect((await devGet(`/api/plan-sessions/${a.id}`, OTRO)).status).toBe(404);
    expect(
      (
        await devSend(
          `/api/plan-sessions/${a.id}`,
          "PUT",
          { items: [{ exerciseId: bench }] },
          OTRO,
        )
      ).status,
    ).toBe(404);
    expect(
      (await devSend(`/api/plan-sessions/${a.id}`, "DELETE", null, OTRO))
        .status,
    ).toBe(404);
    // La de A sigue intacta.
    const still = (await body(await get(`/api/plan-sessions/${a.id}`))) as {
      name: string;
    };
    expect(still.name).toBe("De A");
  });

  it("cada usuario planifica y registra el MISMO día sin pisarse", async () => {
    const { bench } = await seed();
    const a = (await body(
      await post("/api/plan-sessions", {
        date: "2026-12-02",
        name: "A",
        items: [{ exerciseId: bench, targetSets: 3 }],
      }),
    )) as { id: number; exercises: { id: number }[] };
    expect(
      (
        await post("/api/workout-logs/2026-12-02", {
          effort: 3,
          sets: [
            {
              planSessionExerciseId: a.exercises[0].id,
              setIndex: 0,
              reps: 8,
              done: true,
            },
          ],
        })
      ).status,
    ).toBe(201);

    // El UNIQUE es (user_id, date): B estrena su propia sesión ese día.
    const bRes = await devSend(
      "/api/plan-sessions",
      "POST",
      {
        date: "2026-12-02",
        name: "B",
        items: [{ exerciseId: bench, targetSets: 5 }],
      },
      OTRO,
    );
    expect(bRes.status).toBe(201);
    const b = (await bRes.json()) as {
      id: number;
      exercises: { id: number }[];
    };
    expect(b.id).not.toBe(a.id);
    expect(
      (
        await devSend(
          "/api/workout-logs/2026-12-02",
          "POST",
          {
            effort: 4,
            sets: [
              {
                planSessionExerciseId: b.exercises[0].id,
                setIndex: 0,
                reps: 10,
                done: true,
              },
            ],
          },
          OTRO,
        )
      ).status,
    ).toBe(201);

    // El registro del mismo día es de cada uno, y el índice también.
    const logA = (await (await get("/api/workout-logs/2026-12-02")).json()) as {
      effort: number;
      session: { name: string };
    };
    expect(logA.effort).toBe(3);
    expect(logA.session.name).toBe("A");
    const logB = (await (
      await devGet("/api/workout-logs/2026-12-02", OTRO)
    ).json()) as { effort: number; session: { name: string } };
    expect(logB.effort).toBe(4);
    expect(logB.session.name).toBe("B");
    const histA = (await (await get("/api/workout-logs")).json()) as {
      days: { sessionName: string }[];
    };
    expect(histA.days.map((d) => d.sessionName)).toEqual(["A"]);
    const histB = (await (await devGet("/api/workout-logs", OTRO)).json()) as {
      days: { sessionName: string }[];
    };
    expect(histB.days.map((d) => d.sessionName)).toEqual(["B"]);
  });
});
