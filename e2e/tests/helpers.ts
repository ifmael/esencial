import type { APIRequestContext } from "@playwright/test";

/** B' (dos despliegues): la API es su propio Worker y en e2e escucha aquí
 *  (ver playwright.config.ts). Las peticiones directas de los tests van a esta
 *  URL; el navegador llega por su cuenta, vía VITE_API_URL. */
export const API_BASE = process.env.E2E_API_URL ?? "http://127.0.0.1:8790";

/** URL absoluta de la API para las peticiones que no pasan por los helpers. */
export const apiUrl = (path: string) => `${API_BASE}${path}`;

/** POST /api/auth/login with dev password; returns raw response. */
export function login(request: APIRequestContext, password: string) {
  return request.post(apiUrl("/api/auth/login"), { data: { password } });
}

/** Authenticated API request helper (cookies live in request context). Parses the JSON body. */
export async function apiRequest<T = unknown>(
  request: APIRequestContext,
  method: string,
  url: string,
  data?: unknown,
): Promise<T> {
  const res = await request.fetch(apiUrl(url), { method, data });
  if (!res.ok()) throw new Error(`API ${method} ${url} → ${res.status()}`);
  return (await res.json()) as T;
}

/** Unique name per run so tests never collide with existing rows. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Ejercicio del catálogo SEMBRADO, resuelto por nombre.
 *
 * Nunca se recrea: `exercises.name` es UNIQUE, así que un POST con un nombre de
 * la semilla devuelve 400. La base de e2e nace de `api/migrations/`, de modo que
 * el catálogo siempre está ahí. */
export async function seededExercise(
  request: APIRequestContext,
  name: string,
): Promise<{ id: number; name: string }> {
  const all = await apiRequest<{ id: number; name: string }[]>(
    request,
    "GET",
    "/api/exercises",
  );
  const found = all.find((e) => e.name === name);
  if (!found) throw new Error(`El catálogo sembrado no tiene "${name}"`);
  return found;
}
