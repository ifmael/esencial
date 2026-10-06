// Bloques de ejercicios (superseries): la marca `superset` encadena un
// ejercicio con el siguiente de la lista. Un bloque son dos o más filas
// seguidas marcadas; el último no lleva marca y es el único con descansos.
// Aquí se fijan la ida y vuelta y los bordes que la API rechaza.
import { beforeAll, describe, expect, it } from "vitest";
import { d1, freshDb, get, post, put } from "./helpers";

beforeAll(freshDb);

/** Ejercicio del payload (entrada del test). */
type Item = {
  exerciseId: number;
  superset?: boolean;
  targetSets?: number | null;
  restSecs?: number | null;
  restAfterSecs?: number | null;
};

/** Ejercicio tal como lo devuelve el JSON del plan (DTO del test). */
type WireRow = Item & { superset: boolean; kind: string };

let bench = 0;
let row = 0;
let run = 0;
let bike = 0;

beforeAll(async () => {
  bench = await d1.run("INSERT INTO exercises (name) VALUES ('Press banca')");
  row = await d1.run("INSERT INTO exercises (name) VALUES ('Remo')");
  run = await d1.run(
    "INSERT INTO exercises (name, kind) VALUES ('Running', 'running')",
  );
  bike = await d1.run(
    "INSERT INTO exercises (name, kind) VALUES ('Bici', 'cycling')",
  );
});

describe("bloques en el día (superseries)", () => {
  it("guarda la marca y la devuelve: el primero encadenado, el último no", async () => {
    const res = await post("/api/plan-sessions", {
      date: "2026-10-06",
      name: null,
      items: [
        { exerciseId: bench, targetSets: 3, superset: true },
        { exerciseId: row, targetSets: 3, restSecs: 90, restAfterSecs: 150 },
      ],
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: number };
    const detail = (await (
      await get(`/api/plan-sessions/${created.id}`)
    ).json()) as { exercises: WireRow[] };

    expect(detail.exercises.map((e) => e.exerciseId)).toEqual([bench, row]);
    expect(detail.exercises[0]).toMatchObject({
      superset: true,
      restSecs: null,
      restAfterSecs: null,
    });
    expect(detail.exercises[1]).toMatchObject({
      superset: false,
      restSecs: 90,
      restAfterSecs: 150,
    });
  });

  it("sin marca, todos los ejercicios van sueltos", async () => {
    const res = await post("/api/plan-sessions", {
      date: "2026-10-07",
      name: null,
      items: [{ exerciseId: bench }, { exerciseId: row }],
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: number };
    const detail = (await (
      await get(`/api/plan-sessions/${created.id}`)
    ).json()) as { exercises: WireRow[] };
    expect(detail.exercises.map((e) => e.superset)).toEqual([false, false]);
  });

  it("el PUT reemplaza el bloque (marca nueva y descansos del último)", async () => {
    const created = (await (
      await post("/api/plan-sessions", {
        date: "2026-10-08",
        name: null,
        items: [{ exerciseId: bench }, { exerciseId: row }],
      })
    ).json()) as { id: number };
    const res = await put(`/api/plan-sessions/${created.id}`, {
      name: null,
      items: [
        { exerciseId: bench, targetSets: 4, superset: true },
        { exerciseId: row, targetSets: 4, restSecs: 60, restAfterSecs: 120 },
      ],
    });
    expect(res.status).toBe(200);
    const detail = (await res.json()) as { exercises: WireRow[] };
    expect(detail.exercises.map((e) => e.superset)).toEqual([true, false]);
    expect(detail.exercises[0].restSecs).toBeNull();
    expect(detail.exercises[1].restSecs).toBe(60);
  });

  it("la última fila no puede encadenarse", async () => {
    const res = await post("/api/plan-sessions", {
      date: "2026-10-09",
      name: null,
      items: [{ exerciseId: bench, superset: true }],
    });
    expect(res.status).toBe(400);
    const problem = (await res.json()) as { field: string };
    expect(problem.field).toBe("items");
  });

  it("un bloque no puede incluir cardio (encadenar hacia el cardio)", async () => {
    const res = await post("/api/plan-sessions", {
      date: "2026-10-10",
      name: null,
      items: [{ exerciseId: bench, superset: true }, { exerciseId: run }],
    });
    expect(res.status).toBe(400);
    const problem = (await res.json()) as { field: string };
    expect(problem.field).toBe("items");
  });

  it("el cardio no puede encadenarse", async () => {
    const res = await post("/api/plan-sessions", {
      date: "2026-10-11",
      name: null,
      items: [{ exerciseId: run, superset: true }, { exerciseId: bike }],
    });
    expect(res.status).toBe(400);
    const problem = (await res.json()) as { field: string };
    expect(problem.field).toBe("items");
  });

  it("un miembro encadenado no lleva descanso propio", async () => {
    const res = await post("/api/plan-sessions", {
      date: "2026-10-12",
      name: null,
      items: [
        { exerciseId: bench, superset: true, restSecs: 90 },
        { exerciseId: row },
      ],
    });
    expect(res.status).toBe(400);
    const problem = (await res.json()) as { field: string };
    expect(problem.field).toBe("items");
  });

  it("en una sesión registrada la marca no cambia (409); sí el recuento", async () => {
    const created = (await (
      await post("/api/plan-sessions", {
        date: "2026-10-13",
        name: null,
        items: [{ exerciseId: bench }, { exerciseId: row }],
      })
    ).json()) as { id: number };
    await d1.run(
      "UPDATE plan_sessions SET status = 'logged' WHERE id = ?",
      created.id,
    );
    const changed = await put(`/api/plan-sessions/${created.id}`, {
      name: null,
      items: [{ exerciseId: bench, superset: true }, { exerciseId: row }],
    });
    expect(changed.status).toBe(409);

    const counts = await put(`/api/plan-sessions/${created.id}`, {
      name: null,
      items: [
        { exerciseId: bench, targetSets: 5 },
        { exerciseId: row, targetSets: 5 },
      ],
    });
    expect(counts.status).toBe(200);
    const detail = (await counts.json()) as { exercises: WireRow[] };
    expect(detail.exercises.map((e) => e.superset)).toEqual([false, false]);
    expect(detail.exercises[0].targetSets).toBe(5);
  });
});

describe("bloques en la plantilla", () => {
  it("guarda y devuelve la marca con sus descansos", async () => {
    const res = await post("/api/templates", {
      name: "Superserie de empuje",
      exercises: [
        { exerciseId: bench, targetSets: 3, superset: true },
        { exerciseId: row, targetSets: 3, restSecs: 90, restAfterSecs: 150 },
      ],
    });
    expect(res.status).toBe(201);
    const template = (await res.json()) as { exercises: WireRow[] };
    expect(template.exercises.map((e) => e.superset)).toEqual([true, false]);
    expect(template.exercises[1]).toMatchObject({
      restSecs: 90,
      restAfterSecs: 150,
    });
  });

  it("la última entrada no puede encadenarse", async () => {
    const res = await post("/api/templates", {
      name: "Mala",
      exercises: [{ exerciseId: bench, superset: true }],
    });
    expect(res.status).toBe(400);
    const problem = (await res.json()) as { field: string };
    expect(problem.field).toBe("exercises");
  });

  it("el PUT reemplaza el bloque", async () => {
    const created = (await (
      await post("/api/templates", {
        name: "Plana",
        exercises: [{ exerciseId: bench }, { exerciseId: row }],
      })
    ).json()) as { id: number };
    const res = await put(`/api/templates/${created.id}`, {
      name: "Plana",
      exercises: [
        { exerciseId: bench, superset: true },
        { exerciseId: row, restSecs: 60 },
      ],
    });
    expect(res.status).toBe(200);
    const template = (await res.json()) as { exercises: WireRow[] };
    expect(template.exercises.map((e) => e.superset)).toEqual([true, false]);
  });
});
