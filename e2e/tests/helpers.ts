import { APIRequestContext } from "@playwright/test";

/** POST /api/auth/login with dev password; returns raw response. */
export function login(request: APIRequestContext, password: string) {
  return request.post("/api/auth/login", { data: { password } });
}

/** Authenticated API request helper (cookies live in request context). */
export function apiRequest(request: APIRequestContext, method: string, url: string, data?: unknown) {
  return request.fetch(url, { method, data });
}

/** Unique name per run so tests never collide with existing rows. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
