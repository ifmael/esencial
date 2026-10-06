// Métrica de la serie (0025): el catálogo declara la unidad de cada ejercicio
// de fuerza (kg×reps, reps, segundos, kg+segundos) y el registro guarda los
// segundos de una serie por tiempo. Aquí el ida y vuelta completo por la API
// real: catálogo, plan, log y las dos lecturas del histórico.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { freshDb, get, post, put } from "./helpers";

beforeAll(freshDb);
afterEach(() => vi.restoreAllMocks());

/** Crea un ejercicio de fuerza y devuelve su id */
async function createExercise(
  over: Record<string, unknown> = {},
): Promise<number> {
  const res = await post("/api/exercises", {
    name: "Plancha",
    tags: ["core"],
    ...over,
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const ex = (await res.json()) as { id: number };
  return ex.id;
}

/** Planifica un día con ese ejercicio y cierra la sesión con esas series. */
async function planAndLog(
  exerciseId: number,
  date: string,
  sets: Record<string, unknown>[],
) {
  const planned = await post("/api/plan-sessions", {
    date,
    name: "Día",
    items: [{ exerciseId, targetSets: sets.length }],
  });
  expect(planned.status, await planned.clone().text()).toBe(201);
  const created = (await planned.json()) as { exercises: { id: number }[] };
  return post(`/api/workout-logs/${date}`, {
    effort: 3,
    note: null,
    sets: sets.map((s, setIndex) => ({
      planSessionExerciseId: created.exercises[0].id,
      setIndex,
      ...s,
    })),
    cardio: [],
  });
}

describe("metric en el catálogo", () => {
  it("nace en weight_reps si no se dice", async () => {
    const id = await createExercise({ name: "Press militar" });
    const res = await get(`/api/exercises/${id}`);
    const ex = (await res.json()) as { metric: string };
    expect(ex.metric).toBe("weight_reps");
  });

  it("guarda y devuelve la métrica declarada", async () => {
    const id = await createExercise({ name: "Plancha", metric: "time" });
    const res = await get(`/api/exercises/${id}`);
    const ex = (await res.json()) as { metric: string };
    expect(ex.metric).toBe("time");
  });

  it("la cambia al editar (PUT)", async () => {
    const id = await createExercise({ name: "Dominadas", metric: "reps" });
    const res = await put(`/api/exercises/${id}`, {
      name: "Dominadas",
      tags: ["espalda"],
      metric: "weight_reps",
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const updated = (await res.json()) as { metric: string };
    expect(updated.metric).toBe("weight_reps");
  });

  it("rechaza una métrica desconocida", async () => {
    const res = await post("/api/exercises", {
      name: "Rara",
      tags: ["core"],
      metric: "minutos",
    });
    expect(res.status).toBe(400);
    const problem = (await res.json()) as { field: string };
    expect(problem.field).toBe("metric");
  });

  it("el plan devuelve la métrica de cada item", async () => {
    const id = await createExercise({ name: "Bote hueco", metric: "time" });
    const planned = await post("/api/plan-sessions", {
      date: "2026-09-10",
      items: [{ exerciseId: id, targetSets: 3 }],
    });
    expect(planned.status, await planned.clone().text()).toBe(201);
    const created = (await planned.json()) as {
      exercises: { metric: string }[];
    };
    expect(created.exercises[0].metric).toBe("time");
  });
});

describe("series por tiempo", () => {
  it("guarda y devuelve los segundos de una serie hecha, sin repeticiones", async () => {
    const id = await createExercise({
      name: "Plancha lateral",
      metric: "time",
    });
    const logged = await planAndLog(id, "2026-09-11", [
      { durationSecs: 45, reps: null, done: true },
      { durationSecs: 30, reps: null, done: true },
    ]);
    expect(logged.status, await logged.clone().text()).toBe(201);

    const day = (await (await get("/api/workout-logs/2026-09-11")).json()) as {
      sets: {
        reps: number | null;
        weightKg: number | null;
        durationSecs: number | null;
      }[];
    };
    expect(day.sets.map((s) => s.durationSecs)).toEqual([45, 30]);
    expect(day.sets.every((s) => s.reps === null && s.weightKg === null)).toBe(
      true,
    );
  });

  it("una serie hecha sin reps ni segundos es 400 por reps", async () => {
    const id = await createExercise({ name: "Bicho muerto", metric: "time" });
    const logged = await planAndLog(id, "2026-09-12", [
      { reps: null, durationSecs: null, done: true },
    ]);
    expect(logged.status).toBe(400);
    const problem = (await logged.json()) as { field: string };
    expect(problem.field).toBe("sets.0.reps");
  });

  it("el «última» y el histórico devuelven los segundos", async () => {
    const id = await createExercise({ name: "Escaladores", metric: "time" });
    expect(
      (await planAndLog(id, "2026-09-13", [{ durationSecs: 40, done: true }]))
        .status,
    ).toBe(201);
    expect(
      (await planAndLog(id, "2026-09-20", [{ durationSecs: 60, done: true }]))
        .status,
    ).toBe(201);

    const last = await get(`/api/exercises/${id}/last?before=2026-09-21`);
    const latest = (await last.json()) as { last: { durationSecs: number } };
    expect(latest.last.durationSecs).toBe(60);

    const history = (await (
      await get(`/api/exercises/${id}/history`)
    ).json()) as {
      best: { date: string; sets: { durationSecs: number | null }[] };
      sessions: { date: string }[];
    };
    expect(history.sessions.map((s) => s.date)).toEqual([
      "2026-09-20",
      "2026-09-13",
    ]);
    expect(history.best.date).toBe("2026-09-20");
    expect(history.best.sets[0].durationSecs).toBe(60);
  });
});
