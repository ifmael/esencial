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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
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
  const headers = body instanceof FormData ? init?.headers : { "content-type": "application/json", ...(init?.headers ?? {}) };
  return request<T>(url, { ...init, headers });
}

export const apiGet = <T>(path: string) => request<T>(path);

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
 *  la URL servida. Idempotente: ya-prefijado pasa tal cual. */
export const photoSrc = (photoPath: string) =>
  photoPath.startsWith("/api/uploads/") ? photoPath : `/api/uploads/${photoPath}`;
