// B' (dos despliegues): la API es otro Worker, en otro origen. Todo lo que sale
// de la SPA tiene que ir a la URL configurada (VITE_API_URL) y llevar la cookie
// de sesión (credentials: include), o el navegador no la manda.
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetchRaw, apiGet, photoSrc } from "../src/lib/api";

const API = "https://esencial-api.nutrirutina.workers.dev";

type Call = [string, RequestInit];

/** Sustituye fetch y devuelve la lista de llamadas que recibe. */
function stubFetch(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push([url, init ?? {}]);
    return Promise.resolve(new Response("[]", { status: 200 }));
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("la SPA llama a la API por su URL (B')", () => {
  it("con VITE_API_URL, las peticiones van a ese origen y con credenciales", async () => {
    vi.stubEnv("VITE_API_URL", API);
    const calls = stubFetch();

    await apiFetchRaw("/api/recipes");

    expect(calls[0][0]).toBe(`${API}/api/recipes`);
    expect(calls[0][1].credentials).toBe("include");
  });

  it("los helpers con envoltorio JSON también usan la URL de la API", async () => {
    vi.stubEnv("VITE_API_URL", API);
    const calls = stubFetch();

    await apiGet("/api/exercises");

    expect(calls[0][0]).toBe(`${API}/api/exercises`);
    expect(calls[0][1].credentials).toBe("include");
  });

  it("photoSrc resuelve contra la URL de la API (las fotos viven en su R2)", () => {
    vi.stubEnv("VITE_API_URL", API);

    expect(photoSrc("recipe-abc.webp")).toBe(
      `${API}/api/uploads/recipe-abc.webp`,
    );
    expect(photoSrc("/api/uploads/recipe-abc.webp")).toBe(
      `${API}/api/uploads/recipe-abc.webp`,
    );
  });

  it("sin VITE_API_URL (tests unitarios) se queda en rutas relativas", async () => {
    const calls = stubFetch();

    await apiFetchRaw("/api/recipes");

    expect(calls[0][0]).toBe("/api/recipes");
    expect(photoSrc("recipe-abc.webp")).toBe("/api/uploads/recipe-abc.webp");
  });
});
