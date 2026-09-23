// @vitest-environment node
// Worker del frontal (B'): sirve los assets del SPA y hace el guard del HTML.
// El guard vivía en el Worker de la API (pageGuard) y se muda aquí, así que su
// contrato se prueba en este lado. La API es otro Worker: aquí solo hay que
// comprobar cabeceras, redirecciones y la consulta de sesión.
import { afterEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  readSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
} from "../../api/src/auth";
import app, { type WebEnv } from "../worker/index";

const SECRET = "test-auth-secret-32-bytes-long-xx";
const API_ORIGIN = "https://esencial-api.mi-cuenta.workers.dev";
const STATUS_URL = `${API_ORIGIN}/api/auth/status`;
const SHELL = "<!doctype html><html><body><div id=root></div></body></html>";

// El frontal NO lleva copia del secreto: la sesión la valida la API, única dueña
// de la firma. Dos verificadores con el mismo secreto se desincronizan (un
// `secret put` en un solo Worker basta) y el guard rechaza sesiones válidas: en
// producción se veía como un cierre de sesión en cada recarga.
const env = {
  ASSETS: {
    fetch: async () =>
      new Response(SHELL, { headers: { "content-type": "text/html" } }),
  },
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

/** Llamadas que el guard manda a la API (URL y cookie reenviada). */
let apiCalls: { url: string; cookie: string }[] = [];

const realFetch = globalThis.fetch;

/**
 * API de mentira: lee la cookie con el primitivo real de sesión —lo mismo que
 * hace `GET /api/auth/status`— y responde `{ authenticated }`. `down` simula la
 * API inalcanzable y `error` una respuesta 5xx.
 *
 * Se sustituye `globalThis.fetch` a pelo (no `vi.stubGlobal`): el setup global
 * envuelve ese helper para que los tests del SPA respondan siempre «autenticado»
 * al sondeo de sesión, y aquí eso taparía justo lo que hay que probar.
 */
function stubApi(status: "ok" | "down" | "error" = "ok"): void {
  apiCalls = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const cookie = String(
      (init?.headers as Record<string, string> | undefined)?.cookie ?? "",
    );
    apiCalls.push({ url, cookie });
    if (status === "down") throw new Error("API inalcanzable");
    if (status === "error") return new Response("boom", { status: 500 });
    return Response.json({
      authenticated: (await readSession(SECRET, cookie)) !== null,
    });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("guard del HTML en el Worker de la web", () => {
  it("sin sesión, una ruta del SPA redirige a /login?next=", async () => {
    stubApi();
    const res = await get("/plan-recetas");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fplan-recetas");
  });

  it("sin sesión no se pregunta a la API por la cookie", async () => {
    stubApi();
    await get("/");

    expect(apiCalls).toEqual([]);
  });

  it("sin sesión, /login y los assets pasan sin redirigir", async () => {
    stubApi();
    expect((await get("/login")).status).toBe(200);
    expect((await get("/assets/index-abc123.js")).status).toBe(200);
  });

  // Dev: el navegador ve `localhost` y `127.0.0.1` como dos sitios distintos, y
  // la cookie de sesión (SameSite=Lax) no viaja de uno al otro. Un solo origen
  // canónico evita duplicar CORS (WEB_ORIGIN) y CSP (API_ORIGIN) para los dos
  // nombres.
  it("localhost se redirige a 127.0.0.1 conservando ruta y query", async () => {
    const res = await app.request(
      "http://localhost:8787/login?next=%2Fplantillas",
      {},
      env,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://127.0.0.1:8787/login?next=%2Fplantillas",
    );
  });

  // B': la API es otro Worker. Si un /api/* llega al frontal (una URL vieja, un
  // sondeo de salud), tiene que fallar en claro y no colarse por el fallback del
  // SPA devolviendo HTML con 200.
  it("en el frontal /api/* es un 404 JSON, no la shell del SPA", async () => {
    stubApi();
    const res = await get("/api/health");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("con la cookie compartida se sirve el shell del SPA", async () => {
    stubApi();
    const res = await get("/plan-recetas", { cookie: await cookieHeader() });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<div id=root>");
  });

  it("pregunta a la API por la sesión y le reenvía la cookie", async () => {
    stubApi();
    const cookie = await cookieHeader();
    await get("/", { cookie });

    expect(apiCalls).toEqual([{ url: STATUS_URL, cookie }]);
  });

  // En el navegador conviven varias cookies con el mismo nombre (una vieja del
  // host y la compartida del dominio) y viajan todas: el frontal no elige,
  // reenvía el header entero y decide la API.
  it("reenvía los duplicados del mismo nombre sin elegir por su cuenta", async () => {
    stubApi();
    const stale = `${SESSION_COOKIE}=1790000000.firma-invalida`;
    const cookie = `${stale}; ${await cookieHeader()}`;
    const res = await get("/", { cookie });

    expect(apiCalls).toEqual([{ url: STATUS_URL, cookie }]);
    expect(res.status).toBe(200);
  });

  it("una cookie manipulada no vale (fail closed)", async () => {
    stubApi();
    const res = await get("/", {
      cookie: `${SESSION_COOKIE}=1790000000.firma-invalida`,
    });

    expect(res.status).toBe(302);
  });

  it("una sesión caducada no vale (fail closed)", async () => {
    stubApi();
    const exp = Math.floor(Date.now() / 1000) - 60;
    const res = await get("/", {
      cookie: `${SESSION_COOKIE}=${await createSessionToken(SECRET, exp)}`,
    });

    expect(res.status).toBe(302);
  });

  it("si la API está inalcanzable, fail closed", async () => {
    stubApi("down");
    const res = await get("/", { cookie: await cookieHeader() });

    expect(res.status).toBe(302);
  });

  it("si la API responde 5xx, fail closed", async () => {
    stubApi("error");
    const res = await get("/", { cookie: await cookieHeader() });

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
