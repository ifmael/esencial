// E1 parity: exercises CRUD + tags; ?tag= filter (unknown tag → [] not error).
import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, get, post, put, del } from "./helpers";

beforeAll(freshDb);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function makePressBanca(): Promise<number> {
  // reset catalog so the UNIQUE name does not collide between tests
  const all = (await (await get("/api/exercises")).json()) as { id: number }[];
  for (const e of all) await del(`/api/exercises/${e.id}`);
  const res = await post("/api/exercises", {
    name: "Press banca",
    description: "Barra, banca plana",
    setupCues: "Escápulas retraídas, pies firmes",
    tags: ["pecho", "tríceps"],
  });
  expect(res.status).toBe(201);
  return Number((await body(res)).id);
}

describe("/api/exercises", () => {
  it("creates exercise with multiple tags", async () => {
    const id = await makePressBanca();
    const got = await body(await get(`/api/exercises/${id}`));
    expect(got.tags).toEqual(["pecho", "tríceps"]);
    expect(got.setupCues).toBe("Escápulas retraídas, pies firmes");
  });

  it("GET ?tag=pecho returns matching exercise", async () => {
    await makePressBanca();
    await post("/api/exercises", { name: "Sentadilla", tags: ["pierna"] });
    const res = await get("/api/exercises?tag=pecho");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { name: string }[];
    expect(list.map((e) => e.name)).toEqual(["Press banca"]);
  });

  it("unknown tag → 200 [] (not an error)", async () => {
    const res = await get("/api/exercises?tag=inexistente");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("lists all when no filter", async () => {
    await makePressBanca();
    await post("/api/exercises", { name: "Remo", tags: ["espalda"] });
    const list = (await (await get("/api/exercises")).json()) as unknown[];
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it("400 without name", async () => {
    const res = await post("/api/exercises", { tags: ["pecho"] });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("name");
  });

  it("400 without tags (one or more required)", async () => {
    const res = await post("/api/exercises", { name: "Sin tags" });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("tags");
  });

  it("400 on invalid techniqueUrl", async () => {
    const res = await post("/api/exercises", { name: "Malo", tags: ["x"], techniqueUrl: "no-es-url" });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("techniqueUrl");
  });

  it("PUT replaces tags and fields", async () => {
    const id = await makePressBanca();
    const res = await put(`/api/exercises/${id}`, {
      name: "Press banca inclinado",
      tags: ["pecho"],
      setupCues: "30 grados",
    });
    expect(res.status).toBe(200);
    const got = await body(await get(`/api/exercises/${id}`));
    expect(got.name).toBe("Press banca inclinado");
    expect(got.tags).toEqual(["pecho"]);
  });

  it("DELETE removes exercise and its tags", async () => {
    const id = await makePressBanca();
    const res = await del(`/api/exercises/${id}`);
    expect(res.status).toBe(204);
    expect((await get(`/api/exercises/${id}`)).status).toBe(404);
  });
  it("creates exercise with steps and returns them as array", async () => {
    const all = (await (await get("/api/exercises")).json()) as { id: number }[];
    for (const e of all) await del(`/api/exercises/${e.id}`);
    const res = await post("/api/exercises", {
      name: "Sentadilla trasera",
      description: "Carga la barra sobre la espalda.",
      tags: ["pierna"],
      steps: ["Coloca la barra en la espalda", "Baja con la cadera atrás", "Sube empujando el suelo"],
    });
    expect(res.status).toBe(201);
    const id = Number((await body(res)).id);
    const got = await body(await get(`/api/exercises/${id}`));
    expect(got.steps).toEqual(["Coloca la barra en la espalda", "Baja con la cadera atrás", "Sube empujando el suelo"]);
  });

  it("400 on steps containing an empty string", async () => {
    const res = await post("/api/exercises", { name: "Pasos malos", tags: ["x"], steps: ["ok", ""] });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("steps.1");
  });

  it("PUT replaces steps", async () => {
    const id = await makePressBanca();
    const res = await put(`/api/exercises/${id}`, {
      name: "Press banca",
      tags: ["pecho"],
      steps: ["Primer paso", "Segundo paso"],
    });
    expect(res.status).toBe(200);
    const got = await body(await get(`/api/exercises/${id}`));
    expect(got.steps).toEqual(["Primer paso", "Segundo paso"]);
  });
});

