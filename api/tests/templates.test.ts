// CRUD de plantillas: agrupaciones semánticas de ejercicios (fuerza y cardio)
// con series/tiempos por defecto. Sin rotación; sin ejercicios duplicados.
import { beforeAll, describe, expect, it } from "vitest";
import { d1, del, devGet, devSend, freshDb, get, post, put } from "./helpers";

beforeAll(freshDb);

let benchId = 0;
let squatId = 0;
let rowId = 0;
let runId = 0;

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeAll(async () => {
  benchId = await d1.run("INSERT INTO exercises (name) VALUES ('Press banca')");
  squatId = await d1.run("INSERT INTO exercises (name) VALUES ('Sentadilla')");
  rowId = await d1.run("INSERT INTO exercises (name) VALUES ('Remo')");
  runId = await d1.run(
    "INSERT INTO exercises (name, kind) VALUES ('Running', 'running')",
  );
});

const payload = (name: string) => ({
  name,
  exercises: [
    { exerciseId: benchId, targetSets: 4, targetRepsMin: 6, targetRepsMax: 8 },
    { exerciseId: squatId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 },
  ],
});

describe("/api/templates", () => {
  it("creates template with ordered exercises", async () => {
    const res = await post("/api/templates", {
      ...payload("A — Empuje"),
      exercises: [
        ...payload("x").exercises,
        {
          exerciseId: rowId,
          targetSets: 3,
          targetRepsMin: 10,
          targetRepsMax: null,
        },
      ],
    });
    expect(res.status).toBe(201);
    const t = await body(res);
    const exs = t.exercises as {
      exerciseId: number;
      targetSets: number;
      position: number;
    }[];
    expect(exs.map((e) => e.exerciseId)).toEqual([benchId, squatId, rowId]);
    expect(exs[0].targetSets).toBe(4);
  });

  it("guarda cardio con distancia y tiempo en la plantilla", async () => {
    const res = await post("/api/templates", {
      name: "B — Empuje + cardio",
      exercises: [
        { exerciseId: benchId, targetSets: 4 },
        { exerciseId: runId, targetDistanceKm: 10, targetDurationMin: 45 },
      ],
    });
    expect(res.status).toBe(201);
    const got = await body(
      await get(`/api/templates/${Number((await body(res)).id)}`),
    );
    const exs = got.exercises as {
      exerciseId: number;
      kind: string;
      targetDistanceKm: number | null;
      targetDurationMin: number | null;
    }[];
    expect(exs[1]).toMatchObject({
      exerciseId: runId,
      kind: "running",
      targetDistanceKm: 10,
      targetDurationMin: 45,
    });
    expect(exs[0].kind).toBe("strength");
  });

  it("guarda los descansos por ejercicio y los devuelve (null si no)", async () => {
    const res = await post("/api/templates", {
      name: "Z — Descansos",
      exercises: [
        {
          exerciseId: benchId,
          targetSets: 4,
          restSecs: 90,
          restAfterSecs: 150,
        },
        { exerciseId: squatId, targetSets: 3 },
      ],
    });
    expect(res.status).toBe(201);
    const created = await body(res);
    const exs = created.exercises as {
      exerciseId: number;
      restSecs: number | null;
      restAfterSecs: number | null;
    }[];
    expect(exs[0]).toMatchObject({ restSecs: 90, restAfterSecs: 150 });
    expect(exs[1]).toMatchObject({ restSecs: null, restAfterSecs: null });

    const got = (await body(
      await get(`/api/templates/${Number(created.id)}`),
    )) as { exercises: typeof exs };
    expect(got.exercises.map((e) => e.restSecs)).toEqual([90, null]);
    expect(got.exercises.map((e) => e.restAfterSecs)).toEqual([150, null]);

    const updated = (await body(
      await put(`/api/templates/${Number(created.id)}`, {
        name: "Z — Descansos",
        exercises: [
          { exerciseId: benchId, restSecs: 120, restAfterSecs: 120 },
          { exerciseId: squatId },
        ],
      }),
    )) as { exercises: typeof exs };
    expect(updated.exercises.map((e) => e.restSecs)).toEqual([120, null]);
    expect(updated.exercises.map((e) => e.restAfterSecs)).toEqual([120, null]);
  });

  it("400 con un descanso fuera de rango (field exercises.0.restSecs)", async () => {
    const res = await post("/api/templates", {
      name: "Z — Inválida",
      exercises: [{ exerciseId: benchId, restSecs: 0 }],
    });
    expect(res.status).toBe(400);
    const b = (await body(res)) as { field?: string };
    expect(b.field).toBe("exercises.0.restSecs");
  });

  it("GET list ordered by name", async () => {
    const created = await body(
      await post("/api/templates", payload("C — Tirón")),
    );
    const res = await get("/api/templates");
    expect(res.status).toBe(200);
    const list = (await res.json()) as {
      name: string;
      exercises: { exerciseId: number }[];
    }[];
    const c = list.find((t) => t.name === "C — Tirón");
    expect(c?.exercises.map((e) => e.exerciseId)).toEqual([benchId, squatId]);
    expect(Number(created.id)).toBeGreaterThan(0);
    const names = list.map((t) => t.name);
    expect([...names].sort()).toEqual(names);
  });

  it("PUT reorders exercises; order preserved on later GET", async () => {
    const created = await body(
      await post("/api/templates", payload("D — Pierna")),
    );
    const id = Number(created.id);
    const res = await put(`/api/templates/${id}`, {
      name: "D — Pierna",
      exercises: [
        {
          exerciseId: squatId,
          targetSets: 5,
          targetRepsMin: 5,
          targetRepsMax: 5,
        },
        {
          exerciseId: benchId,
          targetSets: 2,
          targetRepsMin: 15,
          targetRepsMax: 20,
        },
      ],
    });
    expect(res.status).toBe(200);
    const got = await body(await get(`/api/templates/${id}`));
    const exs = got.exercises as { exerciseId: number; targetSets: number }[];
    expect(exs.map((e) => e.exerciseId)).toEqual([squatId, benchId]);
    expect(exs[0].targetSets).toBe(5);
  });

  it("PUT conserva los campos de cardio", async () => {
    const created = await body(
      await post("/api/templates", {
        name: "E — Cardio v1",
        exercises: [{ exerciseId: runId, targetDistanceKm: 5 }],
      }),
    );
    const id = Number(created.id);
    await put(`/api/templates/${id}`, {
      name: "E — Cardio v2",
      exercises: [
        { exerciseId: runId, targetDistanceKm: 12, targetDurationMin: 50 },
      ],
    });
    const got = await body(await get(`/api/templates/${id}`));
    const exs = got.exercises as {
      targetDistanceKm: number | null;
      targetDurationMin: number | null;
    }[];
    expect(got.name).toBe("E — Cardio v2");
    expect(exs[0].targetDistanceKm).toBe(12);
    expect(exs[0].targetDurationMin).toBe(50);
  });

  it("400 sin nombre", async () => {
    const res = await post("/api/templates", { exercises: [] });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("name");
  });

  it("400 con un ejercicio repetido (field exercises)", async () => {
    const res = await post("/api/templates", {
      name: "Repetida",
      exercises: [
        { exerciseId: benchId, targetSets: 3 },
        { exerciseId: benchId, targetSets: 4 },
      ],
    });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("exercises");
  });

  it("400 when referencing an unknown exercise", async () => {
    const res = await post("/api/templates", {
      name: "Rota",
      exercises: [{ exerciseId: 999999, targetSets: 3 }],
    });
    expect(res.status).toBe(400);
  });

  it("DELETE removes template (children cascade)", async () => {
    const created = await body(
      await post("/api/templates", payload("F — Borradiza")),
    );
    const id = Number(created.id);
    expect((await del(`/api/templates/${id}`)).status).toBe(204);
    expect((await get(`/api/templates/${id}`)).status).toBe(404);
  });

  it("deleting a still-referenced exercise is blocked (FK RESTRICT → 400)", async () => {
    await post("/api/templates", payload("G — Referencia"));
    const res = await del(`/api/exercises/${benchId}`);
    expect(res.status).toBe(400);
  });
});

// La plantilla es privada del usuario: B no la ve ni la puede tocar (404), pero
// sí puede tener una con el mismo nombre (UNIQUE(user_id, name)).
const B = "bea@esencial.test";

describe("plantillas privadas por usuario", () => {
  it("B no ve la plantilla de A en la lista; A sí", async () => {
    const a = await body(await post("/api/templates", payload("Torso")));
    const listB = (await (await devGet("/api/templates", B)).json()) as {
      id: number;
      name: string;
    }[];
    expect(listB.some((t) => Number(t.id) === Number(a.id))).toBe(false);
    expect(listB.some((t) => t.name === "Torso")).toBe(false);
    const listA = (await (await get("/api/templates")).json()) as {
      id: number;
    }[];
    expect(listA.some((t) => Number(t.id) === Number(a.id))).toBe(true);
  });

  it("B no puede leer, editar ni borrar la de A (404)", async () => {
    const a = await body(await post("/api/templates", payload("Privada")));
    const id = Number(a.id);
    expect((await devGet(`/api/templates/${id}`, B)).status).toBe(404);
    expect(
      (await devSend(`/api/templates/${id}`, "PUT", payload("Privada"), B))
        .status,
    ).toBe(404);
    expect(
      (await devSend(`/api/templates/${id}`, "DELETE", undefined, B)).status,
    ).toBe(404);
    // Sigue intacta para su dueño.
    expect((await get(`/api/templates/${id}`)).status).toBe(200);
  });

  it("B crea una con el mismo nombre sin pisar la de A", async () => {
    const a = await body(await post("/api/templates", payload("Espalda")));
    const resB = await devSend(
      "/api/templates",
      "POST",
      {
        name: "Espalda",
        exercises: [{ exerciseId: rowId, targetSets: 2 }],
      },
      B,
    );
    expect(resB.status).toBe(201);
    const b = await body(resB);
    expect(Number(b.id)).not.toBe(Number(a.id));
    expect(
      (b.exercises as { exerciseId: number }[]).map((e) => e.exerciseId),
    ).toEqual([rowId]);
    // La de A conserva sus hijos.
    const aGot = await body(await get(`/api/templates/${Number(a.id)}`));
    expect(
      (aGot.exercises as { exerciseId: number }[]).map((e) => e.exerciseId),
    ).toEqual([benchId, squatId]);
    // Y B solo ve la suya.
    const listB = (await (await devGet("/api/templates", B)).json()) as {
      id: number;
    }[];
    expect(listB.map((t) => Number(t.id))).toEqual([Number(b.id)]);
  });
});
