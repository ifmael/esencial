// @vitest-environment node
// Worker del frontal (B'): sirve los assets del SPA. Aquí vivía el guard del
// HTML, que ya no existe (la identidad la prueba Cloudflare Access en el borde),
// pero el Worker sigue haciendo tres cosas que conviene fijar: el origen
// canónico de dev, el 404 de /api/* y las cabeceras de seguridad.
import { describe, expect, it } from "vitest";
import app, { type WebEnv } from "../worker/index";

const API_ORIGIN = "https://esencial-api.mi-cuenta.workers.dev";
const SHELL = "<!doctype html><html><body><div id=root></div></body></html>";

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

describe("Worker del frontal", () => {
  // Dev: el navegador ve `localhost` y `127.0.0.1` como dos sitios distintos y
  // la cookie no viaja de uno al otro, así que hay un solo origen canónico.
  it("localhost se redirige a 127.0.0.1 conservando ruta y query", async () => {
    const res = await app.request(
      "http://localhost:8787/plan-recetas?semana=2026-W36",
      {},
      env,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://127.0.0.1:8787/plan-recetas?semana=2026-W36",
    );
  });

  // B': la API es otro Worker. Si un /api/* llega al frontal (una URL vieja, un
  // sondeo de salud), tiene que fallar en claro y no colarse por el fallback del
  // SPA devolviendo HTML con 200.
  it("en el frontal /api/* es un 404 JSON, no la shell del SPA", async () => {
    const res = await get("/api/health");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("una ruta del SPA devuelve la shell", async () => {
    const res = await get("/plan-recetas");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<div id=root>");
  });

  // Estas cabeceras son la razón de un problema conocido del repo: si se
  // endurecen, el iframe de YouTube deja de cargar. Este test es lo único que lo
  // protege, así que no se toca a la ligera.
  it("la CSP autoriza la API y YouTube, y conserva el Referrer", async () => {
    const res = await get("/");
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
