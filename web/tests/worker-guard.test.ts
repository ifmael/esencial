// @vitest-environment node
// Worker del frontal (B'): sirve los assets del SPA y hace el guard del HTML.
// El guard vivía en el Worker de la API (pageGuard) y se muda aquí, así que su
// contrato se prueba en este lado. La API es otro Worker: aquí solo hay que
// comprobar cabeceras y redirecciones.
import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
} from "../../api/src/auth";
import app, { type WebEnv } from "../worker/index";

const SECRET = "test-auth-secret-32-bytes-long-xx";
const API_ORIGIN = "https://esencial-api.mi-cuenta.workers.dev";
const SHELL = "<!doctype html><html><body><div id=root></div></body></html>";

const env = {
  ASSETS: {
    fetch: async () =>
      new Response(SHELL, { headers: { "content-type": "text/html" } }),
  },
  AUTH_SECRET: SECRET,
  API_ORIGIN,
} as unknown as WebEnv;

const get = (path: string, headers: Record<string, string> = {}) =>
  app.request(
    `https://esencial.mi-cuenta.workers.dev${path}`,
    { headers },
    env,
  );

async function cookieHeader(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S;
  return `${SESSION_COOKIE}=${await createSessionToken(SECRET, exp)}`;
}

describe("guard del HTML en el Worker de la web", () => {
  it("sin sesión, una ruta del SPA redirige a /login?next=", async () => {
    const res = await get("/plan-recetas");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fplan-recetas");
  });

  it("sin sesión, /login y los assets pasan sin redirigir", async () => {
    expect((await get("/login")).status).toBe(200);
    expect((await get("/assets/index-abc123.js")).status).toBe(200);
  });

  // B': la API es otro Worker. Si un /api/* llega al frontal (una URL vieja, un
  // sondeo de salud), tiene que fallar en claro y no colarse por el fallback del
  // SPA devolviendo HTML con 200.
  it("en el frontal /api/* es un 404 JSON, no la shell del SPA", async () => {
    const res = await get("/api/health");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("con la cookie compartida se sirve el shell del SPA", async () => {
    const res = await get("/plan-recetas", { cookie: await cookieHeader() });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<div id=root>");
  });

  it("una cookie manipulada no vale (fail closed)", async () => {
    const res = await get("/", {
      cookie: `${SESSION_COOKIE}=1790000000.firma-invalida`,
    });

    expect(res.status).toBe(302);
  });

  it("la CSP autoriza la API y YouTube, y conserva el Referrer", async () => {
    const res = await get("/login");
    const csp = res.headers.get("content-security-policy") ?? "";

    expect(csp).toContain(`connect-src 'self' ${API_ORIGIN}`);
    expect(csp).toContain(`img-src 'self' data: blob: ${API_ORIGIN}`);
    expect(csp).toContain("frame-src https://www.youtube.com");
    expect(res.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
