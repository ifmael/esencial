// Sub-regiones musculares: segundo nivel de la taxonomía. Cada ejercicio cuelga
// de una o varias regiones del mapa anatómico (más finas que el grupo), cada una
// con su grado de implicación (`role`), y toda región tiene que colgar de un
// grupo que ya esté entre sus tags — así filtrar por el grupo padre sigue
// devolviendo el ejercicio.
import { beforeAll, describe, expect, it } from "vitest";
import { d1, del, freshDb, get, post, put } from "./helpers";

beforeAll(freshDb);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("/api/exercises — sub-regiones", () => {
  it("POST guarda las regiones con su grado y las devuelve ordenadas", async () => {
    const res = await post("/api/exercises", {
      name: "Press banca (regiones)",
      tags: ["pecho", "tríceps"],
      regions: [
        { region: "chest-upper", role: "secondary" },
        { region: "triceps-lateral", role: "stabilizer" },
        { region: "chest-lower", role: "primary" },
      ],
    });
    expect(res.status).toBe(201);
    const created = await body(res);
    expect(created.regions).toEqual([
      { region: "chest-lower", role: "primary" },
      { region: "chest-upper", role: "secondary" },
      { region: "triceps-lateral", role: "stabilizer" },
    ]);

    const got = await body(await get(`/api/exercises/${created.id}`));
    expect(got.regions).toEqual(created.regions);

    const list = (await (await get("/api/exercises")).json()) as {
      name: string;
      regions: unknown[];
    }[];
    expect(
      list.find((e) => e.name === "Press banca (regiones)")?.regions,
    ).toEqual(created.regions);
  });

  it("400 {field:'regions'} si la región no está en el vocabulario del mapa", async () => {
    for (const region of [
      "pectoral-superior", // inventada
      "hand-left", // anatomía de relleno, no se filtra
      "chest-upper-left", // id crudo del dibujo: el canónico no lleva lado
    ]) {
      const res = await post("/api/exercises", {
        name: `Región inválida ${region}`,
        tags: ["pecho"],
        regions: [{ region, role: "primary" }],
      });
      expect(res.status, region).toBe(400);
      expect((await body(res)).field, region).toBe("regions");
    }
  });

  it("400 {field:'regions'} con el cuadrado lumbar: se fusionó en Lumbares (0013)", async () => {
    const res = await post("/api/exercises", {
      name: "Cuadrado lumbar suelto",
      tags: ["espalda"],
      regions: [{ region: "lower-back-ql", role: "primary" }],
    });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("regions");
  });

  it("400 {field:'regions'} si la región no cuelga de un tag del ejercicio", async () => {
    const res = await post("/api/exercises", {
      name: "Región de otro grupo",
      tags: ["pecho"],
      regions: [{ region: "biceps", role: "primary" }],
    });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("regions");
  });

  it("400 regions.N… sin grado, con un grado desconocido o con el formato antiguo", async () => {
    for (const regions of [
      [{ region: "chest-upper" }],
      [{ region: "chest-upper", role: "principal" }],
      ["chest-upper"],
    ]) {
      const res = await post("/api/exercises", {
        name: `Grado inválido ${JSON.stringify(regions)}`,
        tags: ["pecho"],
        regions,
      });
      expect(res.status, JSON.stringify(regions)).toBe(400);
      expect((await body(res)).field, JSON.stringify(regions)).toMatch(
        /^regions\.0/,
      );
    }
  });

  it("400 {field:'regions'} si una región se repite, aunque sea con otro grado", async () => {
    const res = await post("/api/exercises", {
      name: "Región repetida",
      tags: ["pecho"],
      regions: [
        { region: "chest-upper", role: "primary" },
        { region: "chest-upper", role: "secondary" },
      ],
    });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("regions");
  });

  it("sin regions sigue funcionando: [] (payload E1 intacto)", async () => {
    const res = await post("/api/exercises", {
      name: "Sin regiones",
      tags: ["pecho"],
    });
    expect(res.status).toBe(201);
    expect((await body(res)).regions).toEqual([]);
  });

  it("PUT reemplaza las regiones y sus grados por completo", async () => {
    const created = await body(
      await post("/api/exercises", {
        name: "Curl reemplazo",
        tags: ["bíceps", "antebrazo"],
        regions: [
          { region: "biceps", role: "primary" },
          { region: "forearm-flexors", role: "secondary" },
        ],
      }),
    );
    const res = await put(`/api/exercises/${created.id}`, {
      name: "Curl reemplazo",
      tags: ["bíceps"],
      regions: [{ region: "biceps", role: "stabilizer" }],
    });
    expect(res.status).toBe(200);
    const got = await body(await get(`/api/exercises/${created.id}`));
    expect(got.regions).toEqual([{ region: "biceps", role: "stabilizer" }]);
    expect(got.tags).toEqual(["bíceps"]);
  });

  it("DELETE borra también sus regiones", async () => {
    const created = await body(
      await post("/api/exercises", {
        name: "Temporal regiones",
        tags: ["pecho"],
        regions: [{ region: "chest-upper", role: "primary" }],
      }),
    );
    expect((await del(`/api/exercises/${created.id}`)).status).toBe(204);
    const left = await d1.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM exercise_regions WHERE exercise_id = ?",
      created.id,
    );
    expect(Number(left?.n)).toBe(0);
  });
});
