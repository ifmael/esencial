// E1 parity: template CRUD with ordered exercises + rotation_index.
import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, d1, get, post, put, del } from "./helpers";

beforeAll(freshDb);

let benchId = 0;
let squatId = 0;
let rowId = 0;

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeAll(async () => {
  benchId = await d1.run("INSERT INTO exercises (name) VALUES ('Press banca')");
  squatId = await d1.run("INSERT INTO exercises (name) VALUES ('Sentadilla')");
  rowId = await d1.run("INSERT INTO exercises (name) VALUES ('Remo')");
});

const payload = (name: string) => ({
  name,
  rotation_index: 0,
  exercises: [
    { exerciseId: benchId, target_sets: 4, target_reps_min: 6, target_reps_max: 8 },
    { exerciseId: squatId, target_sets: 3, target_reps_min: 8, target_reps_max: 12 },
  ],
});

describe("/api/templates", () => {
  it("creates template with ordered exercises", async () => {
    const res = await post("/api/templates", {
      ...payload("A — Empuje"),
      rotation_index: 0,
      exercises: [
        ...payload("x").exercises,
        { exerciseId: rowId, target_sets: 3, target_reps_min: 10, target_reps_max: null },
      ],
    });
    expect(res.status).toBe(201);
    const t = await body(res);
    const exs = t.exercises as { exerciseId: number; target_sets: number; position: number }[];
    expect(exs.map((e) => e.exerciseId)).toEqual([benchId, squatId, rowId]);
    expect(exs[0].target_sets).toBe(4);
  });

  it("GET list preserves order and rotation_index", async () => {
    const created = await body(await post("/api/templates", {
      ...payload("B — Tirón"),
      rotation_index: 1,
    }));
    const res = await get("/api/templates");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { name: string; rotation_index: number; exercises: unknown[] }[];
    const b = list.find((t) => t.name === "B — Tirón");
    expect(b?.rotation_index).toBe(1);
    expect((b?.exercises as { exerciseId: number }[]).map((e) => e.exerciseId)).toEqual([benchId, squatId]);
    expect(Number(created.id)).toBeGreaterThan(0);
  });

  it("PUT reorders exercises; order preserved on later GET", async () => {
    const created = await body(await post("/api/templates", payload("C — Pierna")));
    const id = Number(created.id);
    const res = await put(`/api/templates/${id}`, {
      name: "C — Pierna",
      rotation_index: created.rotation_index ?? 2,
      exercises: [
        { exerciseId: squatId, target_sets: 5, target_reps_min: 5, target_reps_max: 5 },
        { exerciseId: benchId, target_sets: 2, target_reps_min: 15, target_reps_max: 20 },
      ],
    });
    expect(res.status).toBe(200);
    const got = await body(await get(`/api/templates/${id}`));
    const exs = got.exercises as { exerciseId: number; target_sets: number }[];
    expect(exs.map((e) => e.exerciseId)).toEqual([squatId, benchId]);
    expect(exs[0].target_sets).toBe(5);
  });

  it("PUT without rotation_index preserves the stored value", async () => {
    const created = await body(await post("/api/templates", {
      ...payload("D — Full"),
      rotation_index: 3,
    }));
    const id = Number(created.id);
    await put(`/api/templates/${id}`, {
      name: "D — Full v2",
      exercises: [{ exerciseId: benchId, target_sets: 3 }],
    });
    const got = await body(await get(`/api/templates/${id}`));
    expect(got.rotation_index).toBe(3);
    expect(got.name).toBe("D — Full v2");
  });

  it("400 without name", async () => {
    const res = await post("/api/templates", { exercises: [] });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("name");
  });

  it("400 when referencing an unknown exercise", async () => {
    const res = await post("/api/templates", {
      name: "Rota",
      exercises: [{ exerciseId: 999999, target_sets: 3 }],
    });
    expect(res.status).toBe(400);
  });

  it("DELETE removes template (children cascade)", async () => {
    const created = await body(await post("/api/templates", payload("E — Borradiza")));
    const id = Number(created.id);
    expect((await del(`/api/templates/${id}`)).status).toBe(204);
    expect((await get(`/api/templates/${id}`)).status).toBe(404);
  });

  it("deleting a still-referenced exercise is blocked (FK RESTRICT → 400)", async () => {
    await post("/api/templates", payload("F — Referencia"));
    const res = await del(`/api/exercises/${benchId}`);
    expect(res.status).toBe(400);
  });
});
