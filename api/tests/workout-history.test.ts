// Histórico: GET /api/workout-logs (índice de días registrados, del más
// reciente al más antiguo, con lo hecho) y GET /api/exercises/:id/history
// (series marcadas de un ejercicio, por día). Lo hecho es lo marcado con
// `done` (una serie marcada siempre lleva reps), así que una fila del
// borrador sin marcar no cuenta.
import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { d1, freshDb, get, post } from "./helpers";

beforeAll(freshDb);
afterEach(() => vi.restoreAllMocks());

/** Lo que tiene que estar: si falta, el test ha sembrado mal, no un fallo de la API. */
function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null)
    throw new Error(`el test esperaba ${what}`);
  return value;
}

type SetSeed = {
  exercise: string;
  index: number;
  weightKg?: number | null;
  reps?: number | null;
  done: boolean;
};
type CardioSeed = {
  exercise: string;
  distanceKm?: number | null;
  durationMin?: number | null;
  done: boolean;
};
type DaySeed = {
  date: string;
  name?: string | null;
  effort?: number;
  note?: string | null;
  sets?: SetSeed[];
  cardio?: CardioSeed[];
};

/** Borra la cadena de registro; los nombres de ejercicio son UNIQUE. */
async function reset(): Promise<void> {
  for (const t of [
    "cardio_logs",
    "set_logs",
    "workout_logs",
    "plan_session_exercises",
    "plan_sessions",
    "exercises",
  ])
    await d1.run(`DELETE FROM ${t}`);
}

/** Planifica y registra un día entero por la API real (POST de sesión + log). */
async function logDay(day: DaySeed): Promise<void> {
  const sets = day.sets ?? [];
  const cardio = day.cardio ?? [];
  const ids = new Map<string, number>();
  for (const name of new Set([
    ...sets.map((s) => s.exercise),
    ...cardio.map((c) => c.exercise),
  ])) {
    // Los nombres son UNIQUE: varios días comparten catálogo.
    const known = await d1.get<{ id: number }>(
      "SELECT id FROM exercises WHERE name = ?",
      name,
    );
    ids.set(
      name,
      known?.id ??
        (await d1.run(
          "INSERT INTO exercises (name, kind) VALUES (?, ?)",
          name,
          cardio.some((c) => c.exercise === name) ? "running" : "strength",
        )),
    );
  }
  // Un item por ejercicio: las series van después, en el log.
  const items = [
    ...[...new Set(sets.map((s) => s.exercise))].map((name) => ({
      exerciseId: must(ids.get(name), name),
      targetSets: 3,
    })),
    ...[...new Set(cardio.map((c) => c.exercise))].map((name) => ({
      exerciseId: must(ids.get(name), name),
      targetDistanceKm: 5,
      targetDurationMin: 30,
    })),
  ];
  const res = await post("/api/plan-sessions", {
    date: day.date,
    name: day.name ?? null,
    items,
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const created = (await res.json()) as {
    exercises: { id: number; exerciseId: number }[];
  };
  const seOf = new Map(created.exercises.map((e) => [e.exerciseId, e.id]));
  const logged = await post(`/api/workout-logs/${day.date}`, {
    effort: day.effort ?? 3,
    note: day.note ?? null,
    sets: sets.map((s) => ({
      planSessionExerciseId: must(
        seOf.get(must(ids.get(s.exercise), s.exercise)),
        `el item de ${s.exercise}`,
      ),
      setIndex: s.index,
      weightKg: s.weightKg ?? null,
      reps: s.reps ?? null,
      done: s.done,
    })),
    cardio: cardio.map((c) => ({
      planSessionExerciseId: must(
        seOf.get(must(ids.get(c.exercise), c.exercise)),
        `el item de ${c.exercise}`,
      ),
      distanceKm: c.distanceKm ?? null,
      durationMin: c.durationMin ?? null,
      done: c.done,
    })),
  });
  expect(logged.status, await logged.clone().text()).toBe(201);
}

/** Día de empuje: banca marcada y un curl con marcas del borrador sin marcar. */
const pushDay = (
  date: string,
  name: string,
  bench: { weightKg: number; reps: number }[],
): DaySeed => ({
  date,
  name,
  effort: 3,
  note: null,
  sets: [
    ...bench.map((m, i) => ({
      exercise: "Press banca",
      index: i,
      weightKg: m.weightKg,
      reps: m.reps,
      done: true,
    })),
    { exercise: "Curl", index: 0, weightKg: null, reps: 10, done: false },
  ],
});

/** Id del ejercicio sembrado por `logDay`. */
async function exerciseId(name: string): Promise<number> {
  const found = await d1.get<{ id: number }>(
    "SELECT id FROM exercises WHERE name = ?",
    name,
  );
  return must(found, `el ejercicio ${name}`).id;
}

type Day = {
  date: string;
  sessionName: string | null;
  effort: number;
  note: string | null;
  exercises: number;
  sets: number;
  cardio: number;
};

async function history(query = ""): Promise<{
  days: Day[];
  next: string | null;
}> {
  const res = await get(`/api/workout-logs${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as { days: Day[]; next: string | null };
}

describe("GET /api/workout-logs", () => {
  it("lista solo los días registrados, del más reciente al más antiguo", async () => {
    await reset();
    await logDay(
      pushDay("2026-09-05", "Empuje A", [{ weightKg: 57.5, reps: 8 }]),
    );
    await logDay(pushDay("2026-09-07", "Tirón B", [{ weightKg: 60, reps: 6 }]));
    // Planificado sin registrar: no es histórico.
    const sentadilla = await d1.run(
      "INSERT INTO exercises (name) VALUES ('Sentadilla')",
    );
    const planned = await post("/api/plan-sessions", {
      date: "2026-09-08",
      items: [{ exerciseId: sentadilla, targetSets: 3 }],
    });
    expect(planned.status).toBe(201);

    const { days, next } = await history();

    expect(next).toBeNull();
    expect(days.map((d) => d.date)).toEqual(["2026-09-07", "2026-09-05"]);
    expect(days[0]).toEqual({
      date: "2026-09-07",
      sessionName: "Tirón B",
      effort: 3,
      note: null,
      exercises: 1,
      sets: 1,
      cardio: 0,
    });
  });

  it("cuenta solo lo marcado: series y cardio con done, y el ejercicio que las tiene", async () => {
    await reset();
    await logDay({
      date: "2026-09-05",
      name: "Mixto",
      effort: 4,
      note: "buen día",
      sets: [
        // Marcadas: cuentan.
        {
          exercise: "Press banca",
          index: 0,
          weightKg: 60,
          reps: 8,
          done: true,
        },
        {
          exercise: "Press banca",
          index: 1,
          weightKg: 60,
          reps: 7,
          done: true,
        },
        // Marcas del borrador sin marcar: no cuentan.
        {
          exercise: "Press banca",
          index: 2,
          weightKg: 60,
          reps: 6,
          done: false,
        },
        { exercise: "Curl", index: 0, weightKg: 12, reps: 10, done: false },
        { exercise: "Curl", index: 1, weightKg: null, reps: null, done: false },
      ],
      cardio: [
        { exercise: "Running", distanceKm: 5, durationMin: 30, done: true },
        { exercise: "Bici", distanceKm: null, durationMin: null, done: false },
      ],
    });

    const { days } = await history();

    expect(days).toEqual([
      {
        date: "2026-09-05",
        sessionName: "Mixto",
        effort: 4,
        note: "buen día",
        exercises: 1,
        sets: 2,
        cardio: 1,
      },
    ]);
  });

  it("sin registros devuelve lista vacía, no un error", async () => {
    await reset();
    expect(await history()).toEqual({ days: [], next: null });
  });

  it("pagina con limit y avanza con before (exclusivo)", async () => {
    await reset();
    await logDay(pushDay("2026-09-01", "A", [{ weightKg: 50, reps: 8 }]));
    await logDay(pushDay("2026-09-03", "B", [{ weightKg: 50, reps: 8 }]));
    await logDay(pushDay("2026-09-05", "C", [{ weightKg: 50, reps: 8 }]));

    const first = await history("?limit=2");
    expect(first.days.map((d) => d.date)).toEqual(["2026-09-05", "2026-09-03"]);
    expect(first.next).toBe("2026-09-03");

    const second = await history(`?limit=2&before=${first.next}`);
    expect(second.days.map((d) => d.date)).toEqual(["2026-09-01"]);
    expect(second.next).toBeNull();
  });

  it("rechaza limit y before malformados", async () => {
    const zero = await get("/api/workout-logs?limit=0");
    expect(zero.status).toBe(400);
    expect(await zero.json()).toEqual({
      error: "limit must be 1-60",
      field: "limit",
    });

    const huge = await get("/api/workout-logs?limit=61");
    expect(huge.status).toBe(400);
    expect(await huge.json()).toEqual({
      error: "limit must be 1-60",
      field: "limit",
    });

    const date = await get("/api/workout-logs?before=ayer");
    expect(date.status).toBe(400);
    expect(await date.json()).toEqual({
      error: "before must be YYYY-MM-DD",
      field: "before",
    });
  });

  it("filtra por rango de fechas, con los dos extremos incluidos", async () => {
    await reset();
    for (const date of ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"])
      await logDay(pushDay(date, "A", [{ weightKg: 50, reps: 8 }]));

    const rango = await history("?from=2026-09-02&to=2026-09-03");
    expect(rango.days.map((d) => d.date)).toEqual(["2026-09-03", "2026-09-02"]);
    expect(rango.next).toBeNull();

    const desde = await history("?from=2026-09-03");
    expect(desde.days.map((d) => d.date)).toEqual(["2026-09-04", "2026-09-03"]);

    const hasta = await history("?to=2026-09-02");
    expect(hasta.days.map((d) => d.date)).toEqual(["2026-09-02", "2026-09-01"]);
  });

  it("pagina dentro del rango: `before` no se sale del `from`", async () => {
    await reset();
    for (const date of ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"])
      await logDay(pushDay(date, "A", [{ weightKg: 50, reps: 8 }]));

    const first = await history("?from=2026-09-02&limit=2");
    expect(first.days.map((d) => d.date)).toEqual(["2026-09-04", "2026-09-03"]);
    expect(first.next).toBe("2026-09-03");

    const second = await history(
      `?from=2026-09-02&limit=2&before=${first.next}`,
    );
    expect(second.days.map((d) => d.date)).toEqual(["2026-09-02"]);
    expect(second.next).toBeNull();
  });

  it("rechaza from y to malformados, y el rango invertido", async () => {
    const malFrom = await get("/api/workout-logs?from=ayer");
    expect(malFrom.status).toBe(400);
    expect(await malFrom.json()).toEqual({
      error: "from must be YYYY-MM-DD",
      field: "from",
    });

    const malTo = await get("/api/workout-logs?to=2026-09");
    expect(malTo.status).toBe(400);
    expect(await malTo.json()).toEqual({
      error: "to must be YYYY-MM-DD",
      field: "to",
    });

    const invertido = await get(
      "/api/workout-logs?from=2026-09-05&to=2026-09-01",
    );
    expect(invertido.status).toBe(400);
    expect(await invertido.json()).toEqual({
      error: "to must not be before from",
      field: "to",
    });

    // El mismo día en los dos extremos es un rango válido de un día.
    await reset();
    await logDay(pushDay("2026-09-01", "A", [{ weightKg: 50, reps: 8 }]));
    const unDia = await history("?from=2026-09-01&to=2026-09-01");
    expect(unDia.days.map((d) => d.date)).toEqual(["2026-09-01"]);
  });

  it("resuelve la página con un número de consultas fijo", async () => {
    await reset();
    const queries = async (): Promise<number> => {
      const spy = vi.spyOn(env.DB, "prepare");
      await history();
      const n = spy.mock.calls.length;
      spy.mockRestore();
      return n;
    };

    await logDay(pushDay("2026-09-01", "A", [{ weightKg: 50, reps: 8 }]));
    const few = await queries();
    for (const date of ["2026-09-02", "2026-09-03", "2026-09-04"])
      await logDay(pushDay(date, "A", [{ weightKg: 50, reps: 8 }]));
    expect(await queries()).toBe(few);
  });
});

type ExerciseSession = {
  date: string;
  sessionName: string | null;
  sets: { setIndex: number; weightKg: number | null; reps: number }[];
};
type ExerciseHistory = {
  exerciseId: number;
  kind: string;
  best: ExerciseSession | null;
  sessions: ExerciseSession[];
  next: string | null;
};

async function exerciseHistory(
  id: number,
  query = "",
): Promise<ExerciseHistory> {
  const res = await get(`/api/exercises/${id}/history${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as ExerciseHistory;
}

describe("GET /api/exercises/:id/history", () => {
  it("devuelve las series marcadas del ejercicio, por día y del más reciente al más antiguo", async () => {
    await reset();
    await logDay({
      date: "2026-09-01",
      name: "Empuje A",
      sets: [
        {
          exercise: "Press banca",
          index: 0,
          weightKg: 55,
          reps: 10,
          done: true,
        },
        {
          exercise: "Press banca",
          index: 1,
          weightKg: 60,
          reps: 6,
          done: false,
        },
        { exercise: "Curl", index: 0, weightKg: 12, reps: 10, done: true },
      ],
    });
    await logDay({
      date: "2026-09-03",
      name: "Empuje B",
      sets: [
        {
          exercise: "Press banca",
          index: 0,
          weightKg: 60,
          reps: 8,
          done: true,
        },
        {
          exercise: "Press banca",
          index: 1,
          weightKg: 60,
          reps: 7,
          done: true,
        },
      ],
    });
    const bench = await exerciseId("Press banca");

    const page = await exerciseHistory(bench);

    expect(page.exerciseId).toBe(bench);
    expect(page.kind).toBe("strength");
    expect(page.sessions).toEqual([
      {
        date: "2026-09-03",
        sessionName: "Empuje B",
        sets: [
          { setIndex: 0, weightKg: 60, reps: 8 },
          { setIndex: 1, weightKg: 60, reps: 7 },
        ],
        cardio: null,
      },
      {
        date: "2026-09-01",
        sessionName: "Empuje A",
        sets: [{ setIndex: 0, weightKg: 55, reps: 10 }],
        cardio: null,
      },
    ]);
    expect(page.next).toBeNull();
  });

  it("devuelve el cardio hecho de un ejercicio de cardio, sin series", async () => {
    await reset();
    await logDay({
      date: "2026-09-01",
      name: "Cardio",
      cardio: [
        { exercise: "Running", distanceKm: 5, durationMin: 30, done: true },
      ],
    });
    await logDay({
      date: "2026-09-02",
      name: "Cardio",
      cardio: [
        {
          exercise: "Running",
          distanceKm: null,
          durationMin: null,
          done: false,
        },
      ],
    });

    const page = await exerciseHistory(await exerciseId("Running"));

    expect(page.kind).toBe("running");
    expect(page.sessions).toEqual([
      {
        date: "2026-09-01",
        sessionName: "Cardio",
        sets: [],
        cardio: { distanceKm: 5, durationMin: 30 },
      },
    ]);
  });

  it("no incluye días en los que el ejercicio no se marcó", async () => {
    await reset();
    await logDay(pushDay("2026-09-01", "A", [{ weightKg: 50, reps: 8 }]));
    await logDay({
      date: "2026-09-02",
      name: "A",
      sets: [
        {
          exercise: "Press banca",
          index: 0,
          weightKg: null,
          reps: 8,
          done: false,
        },
      ],
    });

    const page = await exerciseHistory(await exerciseId("Press banca"));

    expect(page.sessions.map((s) => s.date)).toEqual(["2026-09-01"]);
  });

  it("pagina por sesiones con limit y before", async () => {
    await reset();
    for (const date of ["2026-09-01", "2026-09-02", "2026-09-03"])
      await logDay(pushDay(date, "A", [{ weightKg: 50, reps: 8 }]));
    const bench = await exerciseId("Press banca");

    const first = await exerciseHistory(bench, "?limit=2");
    expect(first.sessions.map((s) => s.date)).toEqual([
      "2026-09-03",
      "2026-09-02",
    ]);
    expect(first.next).toBe("2026-09-02");

    const second = await exerciseHistory(
      bench,
      `?limit=2&before=${first.next}`,
    );
    expect(second.sessions.map((s) => s.date)).toEqual(["2026-09-01"]);
    expect(second.next).toBeNull();
  });

  it("filtra el historial del ejercicio por rango de fechas", async () => {
    await reset();
    for (const date of ["2026-09-01", "2026-09-02", "2026-09-03"])
      await logDay(pushDay(date, "A", [{ weightKg: 50, reps: 8 }]));
    const bench = await exerciseId("Press banca");

    const rango = await exerciseHistory(
      bench,
      "?from=2026-09-02&to=2026-09-02",
    );

    expect(rango.sessions.map((s) => s.date)).toEqual(["2026-09-02"]);
    expect(rango.next).toBeNull();
  });

  it("el «mejor» mira todo el histórico, no solo la página cargada", async () => {
    await reset();
    // El día más pesado es el MÁS VIEJO: cae fuera de la primera página.
    await logDay(pushDay("2026-09-01", "A", [{ weightKg: 80, reps: 3 }]));
    await logDay(pushDay("2026-09-02", "A", [{ weightKg: 60, reps: 8 }]));
    await logDay(pushDay("2026-09-03", "A", [{ weightKg: 62.5, reps: 6 }]));
    const bench = await exerciseId("Press banca");

    const page = await exerciseHistory(bench, "?limit=1");

    expect(page.sessions.map((s) => s.date)).toEqual(["2026-09-03"]);
    expect(page.next).toBe("2026-09-03");
    expect(page.best).toEqual({
      date: "2026-09-01",
      sessionName: "A",
      sets: [{ setIndex: 0, weightKg: 80, reps: 3 }],
      cardio: null,
    });
  });

  it("sin kilos, el «mejor» son las repeticiones", async () => {
    await reset();
    await logDay({
      date: "2026-09-01",
      name: "A",
      sets: [
        {
          exercise: "Dominadas",
          index: 0,
          weightKg: null,
          reps: 9,
          done: true,
        },
        {
          exercise: "Dominadas",
          index: 1,
          weightKg: null,
          reps: 5,
          done: true,
        },
      ],
    });

    const page = await exerciseHistory(await exerciseId("Dominadas"));

    expect(page.best?.sets).toEqual([{ setIndex: 0, weightKg: null, reps: 9 }]);
  });

  it("en cardio, el «mejor» es la distancia más larga", async () => {
    await reset();
    await logDay({
      date: "2026-09-01",
      name: "Cardio",
      cardio: [
        { exercise: "Running", distanceKm: 5, durationMin: 30, done: true },
      ],
    });
    await logDay({
      date: "2026-09-02",
      name: "Cardio",
      cardio: [
        { exercise: "Running", distanceKm: 9, durationMin: 48, done: true },
      ],
    });

    const page = await exerciseHistory(await exerciseId("Running"));

    expect(page.best).toEqual({
      date: "2026-09-02",
      sessionName: "Cardio",
      sets: [],
      cardio: { distanceKm: 9, durationMin: 48 },
    });
  });

  it("el «mejor» respeta el rango pedido, y sin marcas es null", async () => {
    await reset();
    await logDay(pushDay("2026-09-01", "A", [{ weightKg: 80, reps: 3 }]));
    await logDay(pushDay("2026-09-02", "A", [{ weightKg: 60, reps: 8 }]));
    const bench = await exerciseId("Press banca");

    const rango = await exerciseHistory(bench, "?from=2026-09-02");
    expect(rango.best?.sets).toEqual([{ setIndex: 0, weightKg: 60, reps: 8 }]);

    const vacio = await exerciseHistory(bench, "?from=2027-01-01");
    expect(vacio.sessions).toEqual([]);
    expect(vacio.best).toBeNull();
  });

  it("404 si el ejercicio no existe y 400 si el id o el limit son inválidos", async () => {
    await reset();
    const missing = await get("/api/exercises/9999/history");
    expect(missing.status).toBe(404);

    const badId = await get("/api/exercises/abc/history");
    expect(badId.status).toBe(400);

    await logDay(pushDay("2026-09-01", "A", [{ weightKg: 50, reps: 8 }]));
    const bench = await exerciseId("Press banca");
    const badLimit = await get(`/api/exercises/${bench}/history?limit=0`);
    expect(badLimit.status).toBe(400);
  });
});
