import { APIRequestContext } from "@playwright/test";

/** POST /api/auth/login with dev password; returns raw response. */
export function login(request: APIRequestContext, password: string) {
  return request.post("/api/auth/login", { data: { password } });
}

/** Authenticated API request helper (cookies live in request context). Parses the JSON body. */
export async function apiRequest<T = unknown>(
  request: APIRequestContext,
  method: string,
  url: string,
  data?: unknown,
): Promise<T> {
  const res = await request.fetch(url, { method, data });
  if (!res.ok()) throw new Error(`API ${method} ${url} → ${res.status()}`);
  return (await res.json()) as T;
}

/** Unique name per run so tests never collide with existing rows. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
