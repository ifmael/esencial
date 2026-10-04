// E1 parity: exercises CRUD + tags; ?tag= filter (unknown tag → [] not error).
import { beforeAll, describe, expect, it } from "vitest";
import { d1, del, devGet, devSend, freshDb, get, post, put } from "./helpers";

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
    const res = await post("/api/exercises", {
      name: "Malo",
      tags: ["x"],
      techniqueUrl: "no-es-url",
    });
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
    const all = (await (await get("/api/exercises")).json()) as {
      id: number;
    }[];
    for (const e of all) await del(`/api/exercises/${e.id}`);
    const res = await post("/api/exercises", {
      name: "Sentadilla trasera",
      description: "Carga la barra sobre la espalda.",
      tags: ["pierna"],
      steps: [
        "Coloca la barra en la espalda",
        "Baja con la cadera atrás",
        "Sube empujando el suelo",
      ],
    });
    expect(res.status).toBe(201);
    const id = Number((await body(res)).id);
    const got = await body(await get(`/api/exercises/${id}`));
    expect(got.steps).toEqual([
      "Coloca la barra en la espalda",
      "Baja con la cadera atrás",
      "Sube empujando el suelo",
    ]);
  });

  it("400 on steps containing an empty string", async () => {
    const res = await post("/api/exercises", {
      name: "Pasos malos",
      tags: ["x"],
      steps: ["ok", ""],
    });
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

  it("kind por defecto strength", async () => {
    const id = await makePressBanca();
    const got = await body(await get(`/api/exercises/${id}`));
    expect(got.kind).toBe("strength");
  });

  it("crea cardio con kind running y lo devuelve", async () => {
    const res = await post("/api/exercises", {
      name: "Running",
      tags: ["cardio"],
      kind: "running",
    });
    expect(res.status).toBe(201);
    const created = (await body(res)) as { id: number; kind: string };
    expect(created.kind).toBe("running");
    const got = await body(await get(`/api/exercises/${created.id}`));
    expect(got.kind).toBe("running");
  });

  it("400 con kind desconocido", async () => {
    const res = await post("/api/exercises", {
      name: "Raro",
      tags: ["x"],
      kind: "cinta",
    });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("kind");
  });
});

describe("alias de búsqueda", () => {
  it("sin alias salen vacíos", async () => {
    const id = await makePressBanca();
    const got = await body(await get(`/api/exercises/${id}`));
    expect(got.aliases).toEqual([]);
  });

  it("ida y vuelta: se crean, se leen ordenados y salen en la lista", async () => {
    const res = await post("/api/exercises", {
      name: "Paseo del granjero",
      tags: ["antebrazo"],
      aliases: ["farmer carry", "farmer's walk", "paseo de granjero"],
    });
    expect(res.status).toBe(201);
    const created = (await body(res)) as { id: number; aliases: string[] };
    expect(created.aliases).toEqual([
      "farmer carry",
      "farmer's walk",
      "paseo de granjero",
    ]);
    const got = await body(await get(`/api/exercises/${created.id}`));
    expect(got.aliases).toEqual(created.aliases);
    const list = (await (await get("/api/exercises")).json()) as {
      aliases: string[];
    }[];
    expect(list[0].aliases).toEqual(created.aliases);
  });

  it("PUT reemplaza los alias", async () => {
    const id = await makePressBanca();
    await post("/api/exercises", {
      name: "Otro",
      tags: ["pecho"],
      aliases: ["viejo"],
    });
    const res = await put(`/api/exercises/${id}`, {
      name: "Press banca",
      tags: ["pecho"],
      aliases: ["bench press", "press de banca"],
    });
    expect(res.status).toBe(200);
    const got = await body(await get(`/api/exercises/${id}`));
    expect(got.aliases).toEqual(["bench press", "press de banca"]);
  });

  it("400 con un alias vacío", async () => {
    const res = await post("/api/exercises", {
      name: "Alias malo",
      tags: ["pecho"],
      aliases: ["ok", "   "],
    });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("aliases");
  });

  it("400 con un alias repetido (sin mirar mayúsculas ni espacios)", async () => {
    const res = await post("/api/exercises", {
      name: "Alias repes",
      tags: ["pecho"],
      aliases: ["Bench Press", "bench press"],
    });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("aliases");
  });

  it("DELETE se lleva sus alias", async () => {
    const res = await post("/api/exercises", {
      name: "Con alias",
      tags: ["pecho"],
      aliases: ["uno"],
    });
    const created = (await body(res)) as { id: number };
    expect((await del(`/api/exercises/${created.id}`)).status).toBe(204);
    expect(
      await d1.get(
        "SELECT COUNT(*) AS n FROM exercise_aliases WHERE exercise_id = ?",
        created.id,
      ),
    ).toEqual({ n: 0 });
  });
});

// El catálogo lo lee todo el mundo; solo el admin lo escribe.
const MEMBER = "bea@esencial.test";

describe("catálogo de ejercicios: solo el admin escribe", () => {
  it("un member lee (200) pero no crea, edita ni borra (403)", async () => {
    const id = await makePressBanca();
    expect((await devGet("/api/exercises", MEMBER)).status).toBe(200);
    expect((await devGet(`/api/exercises/${id}`, MEMBER)).status).toBe(200);

    const created = await devSend(
      "/api/exercises",
      "POST",
      { name: "Del member", tags: ["pecho"] },
      MEMBER,
    );
    expect(created.status).toBe(403);
    expect(await body(created)).toEqual({ error: "Forbidden" });

    const edited = await devSend(
      `/api/exercises/${id}`,
      "PUT",
      { name: "Renombrado por member", tags: ["pecho"] },
      MEMBER,
    );
    expect(edited.status).toBe(403);

    const removed = await devSend(
      `/api/exercises/${id}`,
      "DELETE",
      undefined,
      MEMBER,
    );
    expect(removed.status).toBe(403);

    // El catálogo queda intacto: ni creado, ni renombrado, ni borrado.
    expect((await body(await get(`/api/exercises/${id}`))).name).toBe(
      "Press banca",
    );
  });
});
