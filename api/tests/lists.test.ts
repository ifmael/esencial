// Las listas (GET /api/recipes, GET /api/exercises) hidratan cada elemento con
// sus hijos. En producción cada consulta es un viaje a D1, así que el número de
// consultas no puede crecer con el número de filas (antes: 5 por receta y 3 por
// ejercicio). Y cada elemento de la lista tiene que ser idéntico a su ficha.
import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { freshDb, get, post } from "./helpers";

beforeAll(freshDb);
afterEach(() => vi.restoreAllMocks());

type Item = { id: number; name: string };

async function list(path: string): Promise<Item[]> {
  const res = await get(path);
  expect(res.status).toBe(200);
  return (await res.json()) as Item[];
}

/** Consultas que prepara una petición. */
async function queriesOf(path: string): Promise<number> {
  const spy = vi.spyOn(env.DB, "prepare");
  await list(path);
  const n = spy.mock.calls.length;
  spy.mockRestore();
  return n;
}

const recipe = (name: string, n: number) => ({
  name,
  servings: 2,
  ingredients: Array.from({ length: n }, (_, i) => ({
    food: `${name} ${i}`,
    quantity: 10 * (i + 1),
    unit: "gr",
  })),
  steps: Array.from({ length: n }, (_, i) => `${name} paso ${i}`),
  materials: [`${name} olla`],
  tags: ["cena", "batch"],
});

const exercise = (name: string) => ({
  name,
  tags: ["pecho", "tríceps"],
  regions: [
    { region: "triceps-lateral", role: "secondary" },
    { region: "chest-upper", role: "primary" },
  ],
});

describe("GET /api/recipes", () => {
  it("cada receta de la lista es igual a su ficha (hijos en orden, sin mezclar)", async () => {
    // Intercaladas a propósito: los hijos de una no pueden caer en la otra.
    for (const r of [recipe("Beta", 3), recipe("alfa", 2), recipe("Gamma", 0)])
      expect((await post("/api/recipes", r)).status).toBe(201);
    const all = await list("/api/recipes");
    expect(all.map((r) => r.name)).toEqual(["alfa", "Beta", "Gamma"]);
    for (const r of all)
      expect(r).toEqual(await (await get(`/api/recipes/${r.id}`)).json());
  });

  it("el número de consultas no crece con el número de recetas", async () => {
    const before = await queriesOf("/api/recipes");
    for (const name of ["Delta", "Épsilon", "Zeta"])
      await post("/api/recipes", recipe(name, 2));
    expect(await queriesOf("/api/recipes")).toBe(before);
  });
});

describe("GET /api/exercises", () => {
  it("cada ejercicio de la lista es igual a su ficha, también filtrando por tag", async () => {
    for (const name of ["Press B", "press A"])
      expect((await post("/api/exercises", exercise(name))).status).toBe(201);
    await post("/api/exercises", { name: "Remo", tags: ["espalda"] });
    const all = await list("/api/exercises");
    expect(all.map((e) => e.name)).toEqual(["press A", "Press B", "Remo"]);
    for (const e of all)
      expect(e).toEqual(await (await get(`/api/exercises/${e.id}`)).json());
    expect((await list("/api/exercises?tag=pecho")).map((e) => e.name)).toEqual(
      ["press A", "Press B"],
    );
  });

  it("el número de consultas no crece con el número de ejercicios", async () => {
    const before = await queriesOf("/api/exercises");
    const tagged = await queriesOf("/api/exercises?tag=pecho");
    for (const name of ["Press C", "Press D", "Press E"])
      await post("/api/exercises", exercise(name));
    expect(await queriesOf("/api/exercises")).toBe(before);
    expect(await queriesOf("/api/exercises?tag=pecho")).toBe(tagged);
  });
});
