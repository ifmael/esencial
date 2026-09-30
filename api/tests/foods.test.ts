// /api/foods: el catálogo que alimenta el editor (sugerencias) y que el usuario
// amplía con alimentos propios. Valores por 100 g/ml; gramsPerUnit opcional.
import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, get, post } from "./helpers";

beforeAll(freshDb);

type Food = {
  id: number;
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  gramsPerUnit: number | null;
};

describe("/api/foods", () => {
  it("POST crea un alimento y GET lo lista ordenado por nombre", async () => {
    const huevo = await post("/api/foods", {
      name: "  Huevos  ",
      kcal: 155,
      protein: 12.6,
      fat: 10.6,
      carbs: 1.1,
      gramsPerUnit: 55,
    });
    expect(huevo.status).toBe(201);
    const created = (await huevo.json()) as Food;
    expect(created).toMatchObject({ name: "Huevos", gramsPerUnit: 55 });
    await post("/api/foods", {
      name: "Arroz",
      kcal: 350,
      protein: 7,
      fat: 1,
      carbs: 78,
    });

    const res = await get("/api/foods");
    expect(res.status).toBe(200);
    const list = (await res.json()) as Food[];
    expect(list.map((f) => f.name)).toEqual(["Arroz", "Huevos"]);
    expect(list[0]).toEqual({
      id: list[0].id,
      name: "Arroz",
      kcal: 350,
      protein: 7,
      fat: 1,
      carbs: 78,
      gramsPerUnit: null,
    });
  });

  it("400 {field:'name'} si el nombre ya existe", async () => {
    const res = await post("/api/foods", {
      name: "Huevos",
      kcal: 1,
      protein: 1,
      fat: 1,
      carbs: 1,
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as { field: string };
    expect(err.field).toBe("name");
  });

  it("400 {field} con valores negativos o sin nombre", async () => {
    const neg = await post("/api/foods", {
      name: "X",
      kcal: -1,
      protein: 0,
      fat: 0,
      carbs: 0,
    });
    expect(neg.status).toBe(400);
    const negErr = (await neg.json()) as { field: string };
    expect(negErr.field).toBe("kcal");
    const blank = await post("/api/foods", {
      name: " ",
      kcal: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    });
    expect(blank.status).toBe(400);
    const blankErr = (await blank.json()) as { field: string };
    expect(blankErr.field).toBe("name");
  });
});
