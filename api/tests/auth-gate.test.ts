// E7 task 3: el contrato del gate de identidad sobre cada ruta, el 404 JSON de
// la API y las cabeceras de seguridad. La identidad la prueba Cloudflare Access
// en el borde; aquí se fija con el seam de dev (X-Dev-Email + DEV_AUTH=1), que
// es el mismo que usan el resto de tests y el e2e.

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { anonGet, del, freshDb, get, post } from "./helpers";

const ADMIN = "admin@esencial.test";

beforeAll(freshDb);

// Every pre-E7 endpoint (the "13 routes" contract enumerates each one).
const ROUTES: Array<[string, string, unknown?]> = [
  ["GET", "/api/recipes"],
  ["POST", "/api/recipes", { name: "x", tags: [] }],
  ["GET", "/api/recipes/1"],
  ["PUT", "/api/recipes/1", { name: "x" }],
  ["DELETE", "/api/recipes/1"],
  ["GET", "/api/exercises"],
  ["POST", "/api/exercises", { name: "x", tags: ["pecho"] }],
  ["GET", "/api/exercises/1"],
  ["PUT", "/api/exercises/1", { name: "x", tags: ["pecho"] }],
  ["DELETE", "/api/exercises/1"],
  ["GET", "/api/exercises/1/last"],
  ["GET", "/api/exercises/1/history"],
  ["GET", "/api/templates"],
  ["POST", "/api/templates", { name: "t" }],
  ["GET", "/api/templates/1"],
  ["PUT", "/api/templates/1", { name: "t" }],
  ["DELETE", "/api/templates/1"],
  ["GET", "/api/meal-plan/2026-W36"],
  ["PUT", "/api/meal-plan/2026-W36", { slots: [] }],
  ["GET", "/api/plan-sessions"],
  [
    "POST",
    "/api/plan-sessions",
    { date: "2026-09-02", items: [{ exerciseId: 1 }] },
  ],
  ["GET", "/api/plan-sessions/1"],
  ["PUT", "/api/plan-sessions/1", { items: [{ exerciseId: 1 }] }],
  ["DELETE", "/api/plan-sessions/1"],
  ["GET", "/api/workout-logs"],
  ["GET", "/api/workout-logs/2026-09-02"],
  ["POST", "/api/workout-logs/2026-09-02", { effort: 3, sets: [] }],
  ["PUT", "/api/workout-logs/2026-09-02", { effort: 3, sets: [] }],
  ["GET", "/api/notes/2026-09-02"],
  ["PUT", "/api/notes/2026-09-02", { text: "hola" }],
  ["GET", "/api/health"],
];

const PROTECTED = ROUTES.filter(
  ([m, p]) => !(m === "GET" && p === "/api/health"),
);

const jsonBody = (method: string, body: unknown): string | undefined =>
  method === "GET" || method === "DELETE"
    ? undefined
    : JSON.stringify(body ?? {});

async function requestAs(
  path: string,
  method: string,
  body: unknown,
): Promise<Response> {
  return await app.request(
    `http://localhost${path}`,
    {
      method,
      headers: { "content-type": "application/json", "X-Dev-Email": ADMIN },
      body: jsonBody(method, body),
    },
    env,
  );
}

describe("gate de identidad en /api/*", () => {
  for (const [method, path, body] of PROTECTED) {
    it(`${method} ${path} sin identidad → 401 { error: "Unauthorized" }`, async () => {
      const res = await app.request(
        `http://localhost${path}`,
        {
          method,
          headers: { "content-type": "application/json" },
          body: jsonBody(method, body),
        },
        env,
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });
  }

  for (const [method, path, body] of PROTECTED) {
    it(`${method} ${path} con la identidad de dev pasa el gate (no 401)`, async () => {
      const res = await requestAs(path, method, body);
      expect(res.status).not.toBe(401);
    });
  }

  it("GET /api/recipes con la identidad de dev → 200", async () => {
    const res = await get("/api/recipes");
    expect(res.status).toBe(200);
  });

  it("gate runs before 404: unknown /api path without identity → 401", async () => {
    const res = await anonGet("/api/does-not-exist");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("/api/health stays open", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("authenticated behavior unchanged: recipes CRUD round-trips with the dev header", async () => {
    const create = await post("/api/recipes", {
      name: "Gazpacho",
      ingredients: [{ food: "tomate", quantity: 4, unit: "ud" }],
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: number; name: string };
    expect(created.name).toBe("Gazpacho");

    const list = await get("/api/recipes");
    expect(list.status).toBe(200);
    const rows = (await list.json()) as unknown[];
    expect(rows.some((r) => (r as { id: number }).id === created.id)).toBe(
      true,
    );

    const removed = await del(`/api/recipes/${created.id}`);
    expect(removed.status).toBe(204);
  });
});

describe("rutas fuera de /api/* (B')", () => {
  // El Worker del frontal sirve el SPA; aquí solo queda el 404 JSON de la API.
  it("una ruta del SPA ya no la sirve la API: 404 JSON", async () => {
    const res = await app.request(
      "http://localhost/plan-recetas",
      { headers: { accept: "text/html" } },
      env,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("api paths still get JSON 404 WITH identity", async () => {
    const res = await get("/api/nada");
    expect(res.status).toBe(404);
    const payload = await res.json();
    expect(
      typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        payload.error,
    ).toBeTruthy();
  });
});

describe("security headers on every response", () => {
  const cases: Array<[string, () => Promise<Response> | Response]> = [
    [
      "404 fuera de /api",
      () =>
        app.request(
          "http://localhost/plan-recetas",
          { headers: { accept: "text/html" } },
          env,
        ),
    ],
    ["401 gate", () => anonGet("/api/recipes")],
    ["authed api", () => get("/api/recipes")],
    ["health abierto", () => get("/api/health")],
  ];
  for (const [label, make] of cases) {
    it(`${label}: CSP + nosniff + referrer`, async () => {
      const res = await make();
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp.startsWith("default-src 'self'")).toBe(true);
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(csp).toContain("frame-src https://www.youtube.com");
    });
  }
});
