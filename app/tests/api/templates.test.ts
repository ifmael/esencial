// 4.1 RED+GREEN: template CRUD with ordered exercises + rotation_index.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useTempDb, call, get, post, put, del } from "../helpers";
import * as collection from "@/app/api/templates/route";
import * as item from "@/app/api/templates/[id]/route";
import { getDb } from "@/lib/db";
import * as exerciseItem from "@/app/api/exercises/[id]/route";
const cleanup = useTempDb();
afterAll(cleanup);

let benchId = 0;
let squatId = 0;
let rowId = 0;

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeAll(() => {
  const ins = getDb().prepare("INSERT INTO exercises (name) VALUES (?) RETURNING id");
  const idOf = (sql: unknown): number => {
    if (sql && typeof sql === "object" && "id" in sql) return Number(sql.id);
    throw new Error("insert returned no id");
  };
  benchId = idOf(ins.get("Press banca"));
  squatId = idOf(ins.get("Sentadilla"));
  rowId = idOf(ins.get("Remo"));
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
    const res = await call(collection.POST, post("/api/templates", {
      ...payload("A — Empuje"),
      rotation_index: 0,
      exercises: [
        ...payload("x").exercises,
        { exerciseId: rowId, target_sets: 3, target_reps_min: 10, target_reps_max: null },
      ],
    }));
    expect(res.status).toBe(201);
    const t = await body(res);
    const exs = t.exercises as { exerciseId: number; target_sets: number; position: number }[];
    expect(exs.map((e) => e.exerciseId)).toEqual([benchId, squatId, rowId]);
    expect(exs[0].target_sets).toBe(4);
  });

  it("GET list preserves order and rotation_index", async () => {
    const created = await body(await call(collection.POST, post("/api/templates", {
      ...payload("B — Tirón"),
      rotation_index: 1,
    })));
    const res = await call(collection.GET, get("/api/templates"));
    expect(res.status).toBe(200);
    const list = (await res.json()) as { name: string; rotation_index: number; exercises: unknown[] }[];
    const b = list.find((t) => t.name === "B — Tirón");
    expect(b?.rotation_index).toBe(1);
    expect((b?.exercises as { exerciseId: number }[]).map((e) => e.exerciseId)).toEqual([benchId, squatId]);
    expect(Number(created.id)).toBeGreaterThan(0);
  });

  it("PUT reorders exercises; order preserved on later GET", async () => {
    const created = await body(await call(collection.POST, post("/api/templates", payload("C — Pierna"))));
    const id = Number(created.id);
    const res = await call(item.PUT, put(`/api/templates/${id}`, {
      name: "C — Pierna",
      rotation_index: created.rotation_index ?? 2,
      exercises: [
        { exerciseId: squatId, target_sets: 5, target_reps_min: 5, target_reps_max: 5 },
        { exerciseId: benchId, target_sets: 2, target_reps_min: 15, target_reps_max: 20 },
      ],
    }), { id: String(id) });
    expect(res.status).toBe(200);
    const got = await body(await call(item.GET, get(`/api/templates/${id}`), { id: String(id) }));
    const exs = got.exercises as { exerciseId: number; target_sets: number }[];
    expect(exs.map((e) => e.exerciseId)).toEqual([squatId, benchId]);
    expect(exs[0].target_sets).toBe(5);
  });

  it("PUT without rotation_index preserves the stored value", async () => {
    const created = await body(await call(collection.POST, post("/api/templates", {
      ...payload("D — Full"),
      rotation_index: 3,
    })));
    const id = Number(created.id);
    await call(item.PUT, put(`/api/templates/${id}`, {
      name: "D — Full v2",
      exercises: [{ exerciseId: benchId, target_sets: 3 }],
    }), { id: String(id) });
    const got = await body(await call(item.GET, get(`/api/templates/${id}`), { id: String(id) }));
    expect(got.rotation_index).toBe(3);
    expect(got.name).toBe("D — Full v2");
  });

  it("400 without name", async () => {
    const res = await call(collection.POST, post("/api/templates", { exercises: [] }));
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("name");
  });

  it("400 when referencing an unknown exercise", async () => {
    const res = await call(collection.POST, post("/api/templates", {
      name: "Rota",
      exercises: [{ exerciseId: 999999, target_sets: 3 }],
    }));
    expect(res.status).toBe(400);
  });

  it("DELETE removes template (children cascade)", async () => {
    const created = await body(await call(collection.POST, post("/api/templates", payload("E — Borradiza"))));
    const id = Number(created.id);
    expect((await call(item.DELETE, del(`/api/templates/${id}`), { id: String(id) })).status).toBe(204);
    expect((await call(item.GET, get(`/api/templates/${id}`), { id: String(id) })).status).toBe(404);
  });

  it("deleting a still-referenced exercise is blocked (FK RESTRICT → 400)", async () => {
    await call(collection.POST, post("/api/templates", payload("F — Referencia")));
    const res = await call(exerciseItem.DELETE, del(`/api/exercises/${benchId}`), { id: String(benchId) });
    expect(res.status).toBe(400);
  });
});
