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

/** Marca de «ya recargué por sesión caducada» en esta pestaña. */
const SESSION_RELOAD_KEY = "esencial.session-reload";

/** Vacía la caché de lecturas (la llama cada escritura; los tests, entre casos). */
export const clearApiCache = () => cache.clear();

/** fetch a la API con credenciales: en cross-origin el navegador no manda la
 *  cookie de sesión si no se pide (credentials: include). La URL sale de
 *  VITE_API_URL (B': la API es otro Worker) y se lee en cada llamada para poder
 *  sustituirla en tests; sin ella quedan rutas relativas. Sin envoltorio JSON,
 *  para llamadas que gestionan la respuesta a mano. Toda escritura vacía la
 *  caché al terminar, también lo que se pidió mientras tanto.
 *
 *  Los fallos de sesión se resuelven recargando: con Cloudflare Access delante
 *  una sesión caducada no da 401 —el borde responde 302 al login, el navegador
 *  sigue el redirect y la petición cross-origin acaba en error de red—, así que
 *  se recarga tanto con un 401 como si el fetch revienta. El freno de
 *  sessionStorage (una recarga por pestaña y sesión) evita el bucle cuando el
 *  fallo es permanente (sin permiso, servidor caído), y se limpia en cuanto una
 *  llamada vuelve a responder para que una caducidad futura sí recargue. */
export const apiFetchRaw = (
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  const reloadOnce = () => {
    try {
      if (sessionStorage.getItem(SESSION_RELOAD_KEY)) return;
      sessionStorage.setItem(SESSION_RELOAD_KEY, "1");
    } catch {
      // Sin sessionStorage (p. ej. modo privado): mejor recargar una vez.
    }
    location.reload();
  };
  const write = (init?.method ?? "GET").toUpperCase() !== "GET";
  const res = fetch(`${import.meta.env.VITE_API_URL ?? ""}${path}`, {
    credentials: "include",
    ...init,
  })
    .then((response) => {
      // 401 = sesión no válida; cualquier otra respuesta = el servidor atendió
      // y la identidad vale, así que la marca de recarga se limpia.
      if (response.status === 401) {
        reloadOnce();
      } else {
        try {
          sessionStorage.removeItem(SESSION_RELOAD_KEY);
        } catch {
          /* sin sessionStorage */
        }
      }
      return response;
    })
    .catch((error) => {
      reloadOnce();
      throw error;
    });
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
