// Shared fetch envelope client (E4). The API answers every failure with
// {error, field?}; non-JSON/failed parses keep a generic message.
export type ApiError = Error & { status: number; field?: string };

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const env: { error?: unknown; field?: unknown } =
      body && typeof body === "object" ? (body as { error?: unknown; field?: unknown }) : {};
    const err = new Error(
      typeof env.error === "string" ? env.error : `Request failed (${res.status})`,
    ) as ApiError;
    err.status = res.status;
    if (typeof env.field === "string") err.field = env.field;
    throw err;
  }
  return body as T;
}

/** The failing field of an ApiError envelope, narrowed at runtime. */
export function apiField(e: unknown): string | undefined {
  if (e && typeof e === "object" && "field" in e && typeof e.field === "string") return e.field;
  return undefined;
}
