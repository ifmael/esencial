// E7 task 3: the auth gate contract over every pre-E7 route, page redirects,
// and security headers. Uses a fresh login per file via /api/auth/login.
import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import app from "../src/index";
import { freshDb, get, post, anonGet } from "./helpers";
import { SESSION_COOKIE, createSessionToken } from "../src/auth";

let cookie = "";

beforeAll(async () => {
  await freshDb();
  const res = await post("/api/auth/login", { password: "test-password-123" });
  expect(res.status).toBe(200);
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  expect(cookie).toContain(SESSION_COOKIE);
});

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return await app.request(`http://localhost${path}`, { ...init, headers: { ...init.headers, cookie } }, env);
}

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
  ["GET", "/api/templates"],
  ["POST", "/api/templates", { name: "t" }],
  ["GET", "/api/templates/1"],
  ["PUT", "/api/templates/1", { name: "t" }],
  ["DELETE", "/api/templates/1"],
  ["GET", "/api/meal-plan/2026-W36"],
  ["PUT", "/api/meal-plan/2026-W36", { slots: [] }],
  ["GET", "/api/plan-sessions?week=2026-W36"],
  ["POST", "/api/plan-sessions", { week: "2026-W36", day: 0, templateId: 1 }],
  ["GET", "/api/workout-logs/2026-09-02"],
  ["POST", "/api/workout-logs/2026-09-02", { templateId: 1, sets: [] }],
  ["GET", "/api/notes/2026-09-02"],
  ["PUT", "/api/notes/2026-09-02", { text: "hola" }],
  ["GET", "/api/health"],
];

const PROTECTED = ROUTES.filter(([m, p]) => !(m === "GET" && p === "/api/health"));

describe("auth gate on /api/*", () => {
  for (const [method, path] of PROTECTED) {
    it(`${method} ${path} without cookie → 401 { error: "Unauthorized" }`, async () => {
      const res = await app.request(
        `http://localhost${path}`,
        { method, headers: { "content-type": "application/json" }, body: method === "GET" || method === "DELETE" ? undefined : "{}" },
        env,
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });
  }

  it("gate runs before 404: unknown /api path without cookie → 401", async () => {
    const res = await anonGet("/api/does-not-exist");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("/api/health stays open", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("authenticated behavior unchanged: recipes CRUD round-trips with cookie", async () => {
    const create = await authedFetch("/api/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Gazpacho", ingredients: [{ food: "tomate", quantity: 4, unit: "ud" }] }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: number; name: string };
    expect(created.name).toBe("Gazpacho");

    const list = await authedFetch("/api/recipes");
    expect(list.status).toBe(200);
    const rows = (await list.json()) as unknown[];
    expect(rows.some((r) => (r as { id: number }).id === created.id)).toBe(true);

    const del = await authedFetch(`/api/recipes/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
  });

  it("tampered cookie (one edited byte) → 401 on protected route", async () => {
    const i = cookie.indexOf(".") + 1;
    const tampered = cookie.slice(0, i) + (cookie[i] === "1" ? "2" : "1") + cookie.slice(i + 1);
    const res = await app.request("http://localhost/api/recipes", { headers: { cookie: tampered } }, env);
    expect(res.status).toBe(401);
  });

  it("expired-but-well-signed cookie → 401", async () => {
    // Sign a token with the test secret expiring in the past, via the same
    // secret the test Worker uses.
    const token = await createSessionToken(env.AUTH_SECRET as string, Math.floor(Date.now() / 1000) - 5);
    const res = await app.request("http://localhost/api/recipes", { headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } }, env);
    expect(res.status).toBe(401);
  });
});

describe("SPA page protection (worker-first)", () => {
  const html = { headers: { accept: "text/html" } };

  it("GET / without session → 302 /login?next=%2F", async () => {
    const res = await app.request("http://localhost/", html, env);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location") as string, "http://localhost").pathname).toBe("/login");
    expect(new URL(res.headers.get("location") as string, "http://localhost").searchParams.get("next")).toBe("/");
  });

  it("GET /plan-recetas without session → 302 with next", async () => {
    const res = await app.request("http://localhost/plan-recetas", html, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fplan-recetas");
  });

  it("GET /login without session → 200 SPA shell", async () => {
    const res = await app.request("http://localhost/login", html, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<div id=\"root\">");
  });

  it("GET / with session → 200 (no redirect loop)", async () => {
    const res = await app.request("http://localhost/", { headers: { accept: "text/html", cookie } }, env);
    expect(res.status).toBe(200);
  });

  it("api paths still get JSON 404 WITH session", async () => {
    const res = await authedFetch("/api/nada");
    expect(res.status).toBe(404);
    const payload = await res.json();
    expect(typeof payload === "object" && payload !== null && "error" in payload && payload.error).toBeTruthy();
  });
});

describe("security headers on every response", () => {
  const cases: Array<[string, RequestInit, () => Promise<Response> | Response]> = [
    ["asset/page", { headers: { accept: "text/html", cookie } }, () => app.request("http://localhost/", { headers: { accept: "text/html", cookie } }, env)],
    ["401 gate", {}, () => get("/api/recipes")],
    ["authed api", {}, () => authedFetch("/api/recipes")],
    ["login failure", {}, () => post("/api/auth/login", { password: "nope-" + Math.random() })],
  ];
  for (const [label, , make] of cases) {
    it(`${label}: CSP + nosniff + referrer`, async () => {
      const res = await make();
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp.startsWith("default-src 'self'")).toBe(true);
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("same-origin");
    });
  }
});
