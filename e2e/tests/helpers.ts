import { type APIRequestContext, expect, type Locator } from "@playwright/test";

/** Cierra la sesión desde el modo sesión: «Terminar» abre el cierre (esfuerzo y
 *  nota) —antes, si queda algo pendiente, el aviso «Series sin completar», que
 *  hay que aceptar—, se elige el esfuerzo y «Terminar» lo guarda (POST o PUT). */
export async function finishSession(mode: Locator, effort = "Moderado") {
  await mode.getByRole("button", { name: "Terminar", exact: true }).click();
  const effortDots = mode.getByRole("radiogroup", {
    name: "Esfuerzo percibido",
  });
  const warning = mode
    .page()
    .getByRole("dialog", { name: "Series sin completar" });
  // Con series pendientes el cierre no se abre hasta aceptar el aviso.
  await expect(effortDots.or(warning)).toBeVisible();
  if (await warning.isVisible()) {
    await warning
      .getByRole("button", { name: "Terminar", exact: true })
      .click();
    await expect(effortDots).toBeVisible();
  }
  await mode.getByText(effort, { exact: true }).click();
  await mode.getByRole("button", { name: "Terminar", exact: true }).click();
}

/** B' (dos despliegues): la API es su propio Worker y en e2e escucha aquí
 *  (ver playwright.config.ts). Las peticiones directas de los tests van a esta
 *  URL; el navegador llega por su cuenta, vía VITE_API_URL. */
export const API_BASE = `http://127.0.0.1:${process.env.E2E_API_PORT ?? "8790"}`;

/** URL absoluta de la API para las peticiones que no pasan por los helpers. */
export const apiUrl = (path: string) => `${API_BASE}${path}`;

/** Authenticated API request helper: el contexto `request` hereda los
 *  extraHTTPHeaders del config (X-Dev-Email con el admin), así que va ya
 *  identificado. Parses the JSON body. */
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
