// Shared E2 test fixtures: fake hydrated recipe + in-memory /api/recipes server
// driven through a fetch stub (same-origin paths only).
import type { Food } from "../src/components/recipes/use-foods";
import type { Recipe } from "../src/components/recipes/use-recipes";

export function makeRecipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: 1,
    name: "Arroz con pollo",
    description: "Clásico de la abuela",
    servings: 4,
    photo_path: null,
    ingredients: [
      {
        id: 11,
        food: "arroz",
        quantity: 300,
        unit: "g",
        foodId: 5,
        optional: false,
      },
      {
        id: 12,
        food: "pollo",
        quantity: 2,
        unit: "pechuga",
        foodId: null,
        optional: false,
      },
      {
        id: 13,
        food: "ajo",
        quantity: 1,
        unit: "diente",
        foodId: 9,
        optional: true,
      },
    ],
    steps: [
      { id: 21, position: 0, step: 1, text: "Sofreír" },
      { id: 22, position: 1, step: 2, text: "Añadir arroz" },
      { id: 23, position: 2, step: 3, text: "Cocer" },
      { id: 24, position: 3, step: 4, text: "Servir" },
    ],
    materials: ["olla", "sartén"],
    tags: ["almuerzo"],
    nutrition: {
      kcal: 520,
      protein: 32,
      fat: 12,
      carbs: 70,
      approximate: true,
    },
    ...over,
  };
}

export type ServerCall = {
  method: string;
  url: string;
  body?: Record<string, unknown> | FormData;
};

export function makeServer(initial: Recipe[] = []) {
  const recipes = [...initial];
  const server = { nextUploadFails: false, nextUploadStatus: 500 };
  const calls: ServerCall[] = [];
  let nextId = 100;
  const foods: Food[] = [
    {
      id: 5,
      name: "Arroz",
      kcal: 350,
      protein: 7,
      fat: 1,
      carbs: 78,
      gramsPerUnit: null,
    },
    {
      id: 9,
      name: "Ajo",
      kcal: 149,
      protein: 6,
      fat: 0.5,
      carbs: 33,
      gramsPerUnit: 5,
    },
    {
      id: 12,
      name: "Pollo",
      kcal: 120,
      protein: 22,
      fat: 3,
      carbs: 0,
      gramsPerUnit: 150,
    },
  ];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });

  const fetchMock = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const raw = init?.body;
    const body =
      typeof raw === "string"
        ? (JSON.parse(raw) as Record<string, unknown>)
        : (raw as FormData | undefined);
    calls.push({
      method,
      url,
      body: body as Record<string, unknown> | undefined,
    });
    if (url === "/api/recipes" && method === "GET")
      return json(recipes.map((r) => ({ ...r })));
    if (url === "/api/recipes" && method === "POST") {
      if ((body as Record<string, unknown>)?.name === "Existente")
        return json({ error: "Ya existe", field: "name" }, 400);
      const created = {
        ingredients: [],
        steps: [],
        materials: [],
        tags: [],
        photo_path: null,
        description: null,
        servings: null,
        ...(body as object),
        id: nextId++,
      } as unknown as Recipe;
      recipes.push(created);
      return json(created, 201);
    }
    const m = /^\/api\/recipes\/(\d+)$/.exec(url);
    if (m) {
      const id = Number(m[1]);
      const i = recipes.findIndex((r) => r.id === id);
      if (method === "GET")
        return i >= 0 ? json(recipes[i]) : json({ error: "Not found" }, 404);
      if (method === "PUT") {
        if (i < 0) return json({ error: "Not found" }, 404);
        recipes[i] = { ...recipes[i], ...(body as object), id } as Recipe;
        return json(recipes[i]);
      }
      if (method === "DELETE") {
        if (i < 0) return json({ error: "Not found" }, 404);
        recipes.splice(i, 1);
        return new Response(null, { status: 204 });
      }
    }
    if (url === "/api/foods" && method === "GET") return json(foods);
    if (url === "/api/foods" && method === "POST") {
      const input = body as Record<string, unknown>;
      if (foods.some((f) => f.name === input.name))
        return json({ error: "Already exists", field: "name" }, 400);
      const created = {
        gramsPerUnit: null,
        ...input,
        id: nextId++,
      } as unknown as Food;
      foods.push(created);
      return json(created, 201);
    }
    if (url === "/api/uploads" && method === "POST") {
      if (server.nextUploadFails)
        return json(
          { error: "No se pudo subir el archivo" },
          server.nextUploadStatus,
        );
      return json({ photo_path: `recipe-${nextId++}.png` }, 200);
    }
    return json({ error: "Not found" }, 404);
  };

  return { fetchMock, calls, recipes, server, foods };
}
