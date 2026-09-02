// 3.1 RED+GREEN: exercises CRUD + tags; ?tag= filter (unknown tag → [] not error).
import { afterAll, describe, expect, it } from "vitest";
import { useTempDb, call, get, post, put, del } from "../helpers";
import * as collection from "@/app/api/exercises/route";
import * as item from "@/app/api/exercises/[id]/route";

const cleanup = useTempDb();
afterAll(cleanup);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function makePressBanca(): Promise<number> {
  // reset catalog so the UNIQUE name does not collide between tests
  const all = (await (await call(collection.GET, get("/api/exercises"))).json()) as { id: number }[];
  for (const e of all) await call(item.DELETE, del(`/api/exercises/${e.id}`), { id: String(e.id) });
  const res = await call(collection.POST, post("/api/exercises", {
    name: "Press banca",
    description: "Barra, banca plana",
    setup_cues: "Escápulas retraídas, pies firmes",
    tags: ["pecho", "tríceps"],
  }));
  expect(res.status).toBe(201);
  return Number((await body(res)).id);
}

describe("/api/exercises", () => {
  it("creates exercise with multiple tags", async () => {
    const id = await makePressBanca();
    const got = await body(await call(item.GET, get(`/api/exercises/${id}`), { id: String(id) }));
    expect(got.tags).toEqual(["pecho", "tríceps"]);
    expect(got.setupCues).toBe("Escápulas retraídas, pies firmes");
  });

  it("GET ?tag=pecho returns matching exercise", async () => {
    await makePressBanca();
    await call(collection.POST, post("/api/exercises", { name: "Sentadilla", tags: ["pierna"] }));
    const res = await call(collection.GET, get("/api/exercises?tag=pecho"));
    expect(res.status).toBe(200);
    const list = (await res.json()) as { name: string }[];
    expect(list.map((e) => e.name)).toEqual(["Press banca"]);
  });

  it("unknown tag → 200 [] (not an error)", async () => {
    const res = await call(collection.GET, get("/api/exercises?tag=inexistente"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("lists all when no filter", async () => {
    await makePressBanca();
    await call(collection.POST, post("/api/exercises", { name: "Remo", tags: ["espalda"] }));
    const list = (await (await call(collection.GET, get("/api/exercises"))).json()) as unknown[];
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it("400 without name", async () => {
    const res = await call(collection.POST, post("/api/exercises", { tags: ["pecho"] }));
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("name");
  });

  it("400 without tags (one or more required)", async () => {
    const res = await call(collection.POST, post("/api/exercises", { name: "Sin tags" }));
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("tags");
  });

  it("400 on invalid technique_url", async () => {
    const res = await call(
      collection.POST,
      post("/api/exercises", { name: "Malo", tags: ["x"], technique_url: "no-es-url" }),
    );
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("technique_url");
  });

  it("PUT replaces tags and fields", async () => {
    const id = await makePressBanca();
    const res = await call(item.PUT, put(`/api/exercises/${id}`, {
      name: "Press banca inclinado",
      tags: ["pecho"],
      setup_cues: "30 grados",
    }), { id: String(id) });
    expect(res.status).toBe(200);
    const got = await body(await call(item.GET, get(`/api/exercises/${id}`), { id: String(id) }));
    expect(got.name).toBe("Press banca inclinado");
    expect(got.tags).toEqual(["pecho"]);
  });

  it("DELETE removes exercise and its tags", async () => {
    const id = await makePressBanca();
    const res = await call(item.DELETE, del(`/api/exercises/${id}`), { id: String(id) });
    expect(res.status).toBe(204);
    expect((await call(item.GET, get(`/api/exercises/${id}`), { id: String(id) })).status).toBe(404);
  });
});
