// Shared typed fetch helper (E6, design D7): parses the {error, field?}
// envelope into ApiError so screens can branch on status/field. E4 surfaces
// (apiFetch/apiField) are kept as compat over the same core.
export class ApiError extends Error {
  constructor(
    public readonly error: string,
    public readonly field: string | undefined,
    public readonly status: number,
  ) {
    super(error);
    this.name = "ApiError";
  }
}

/** Caché en memoria de `apiGetCached`, por ruta. */
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

/** Vacía la caché de lecturas (la llama cada escritura; los tests, entre casos). */
export const clearApiCache = () => cache.clear();

/** fetch a la API con la cookie de sesión incluida: en cross-origin el
 *  navegador no la manda si no se pide (credentials: include). La URL sale de
 *  VITE_API_URL (B': la API es otro Worker) y se lee en cada llamada para poder
 *  sustituirla en tests; sin ella quedan rutas relativas. Sin envoltorio JSON,
 *  para llamadas que gestionan la respuesta a mano. Toda escritura vacía la
 *  caché al terminar, también lo que se pidió mientras tanto. */
export const apiFetchRaw = (
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  const res = fetch(`${import.meta.env.VITE_API_URL ?? ""}${path}`, {
    credentials: "include",
    ...init,
  });
  const write = (init?.method ?? "GET").toUpperCase() !== "GET";
  return write ? res.finally(clearApiCache) : res;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetchRaw(path, init);
  } catch {
    throw new ApiError("No se pudo conectar con el servidor", undefined, 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON (204 etc.) */
  }
  if (!res.ok) {
    const env = (body ?? {}) as { error?: string; field?: string };
    throw new ApiError(
      env.error ?? `HTTP ${res.status}`,
      env.field,
      res.status,
    );
  }
  return body as T;
}

// E4 compat: fetch-style helper that always sends JSON and surfaces ApiError.
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const body = init?.body;
  // FormData: let the runtime set multipart/form-data with its boundary.
  const headers =
    body instanceof FormData
      ? init?.headers
      : { "content-type": "application/json", ...(init?.headers ?? {}) };
  return request<T>(url, { ...init, headers });
}

export const apiGet = <T>(path: string) => request<T>(path);

/** apiGet que reutiliza la respuesta durante 5 minutos: volver a una pantalla
 *  no vuelve a descargar la lista. Guarda la promesa, así que dos pantallas a la
 *  vez comparten una petición; un fallo no se guarda. Los cambios hechos desde
 *  otro dispositivo tardan hasta 5 minutos en verse. */
export function apiGetCached<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as Promise<T>;
  const value = request<T>(path);
  cache.set(path, { at: Date.now(), value });
  value.catch(() => {
    if (cache.get(path)?.value === value) cache.delete(path);
  });
  return value;
}

export const apiSend = <T>(path: string, method: string, body: unknown) =>
  request<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** The failing field of an ApiError envelope, narrowed at runtime (E4 compat). */
export function apiField(e: unknown): string | undefined {
  if (e instanceof ApiError) return e.field;
  if (e && typeof e === "object" && "field" in e && typeof e.field === "string")
    return e.field;
  return undefined;
}

/** DEF-6: uploads se persisten como key `recipe-<uuid>.<ext>`; el <img> necesita
 *  la URL servida (B': contra el origen de la API). Idempotente: ya-prefijado
 *  pasa tal cual. */
export const photoSrc = (photoPath: string): string =>
  `${import.meta.env.VITE_API_URL ?? ""}${
    photoPath.startsWith("/api/uploads/")
      ? photoPath
      : `/api/uploads/${photoPath}`
  }`;
