// Sesiones por día: la sesión es el día (nombre + ejercicios expandidos, sin
// duplicados), creada y reemplazada con items de fuerza y/o cardio.
import { beforeAll, describe, expect, it } from "vitest";
import { d1, del, freshDb, get, post, put } from "./helpers";

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

  it("409 sobre una sesión ya registrada", async () => {
    const { bench } = await seed();
    const created = (await body(
      await post("/api/plan-sessions", {
        date: "2026-10-13",
        items: [{ exerciseId: bench }],
      }),
    )) as { id: number };
    await d1.run(
      "INSERT INTO workout_logs (plan_session_id, date, effort) VALUES (?, ?, 3)",
      created.id,
      "2026-10-13",
    );
    await d1.run(
      "UPDATE plan_sessions SET status='logged' WHERE id=?",
      created.id,
    );
    const res = await put(`/api/plan-sessions/${created.id}`, {
      items: [{ exerciseId: bench, targetSets: 5 }],
    });
    expect(res.status).toBe(409);
  });

  it("404 si no existe", async () => {
    const res = await put("/api/plan-sessions/999999", {
      items: [{ exerciseId: 1 }],
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/plan-sessions", () => {
  it("lista las sesiones con nombre y estado", async () => {
    const { bench } = await seed();
    await post("/api/plan-sessions", {
      date: "2026-10-14",
      name: "Pierna",
      items: [{ exerciseId: bench }],
    });
    const res = await get("/api/plan-sessions");
    const list = (await res.json()) as {
      date: string;
      name: string | null;
      status: string;
    }[];
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      id: expect.any(Number),
      date: "2026-10-14",
      name: "Pierna",
      status: "planned",
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
