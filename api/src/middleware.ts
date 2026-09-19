// E7 middlewares (design D4): security headers on every response, the 401 gate
// on /api/*, and the page guard that redirects unauthenticated HTML to /login.
// Order at the app root: securityHeaders → authGuard → pageGuard.

import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { readSessionToken, SESSION_COOKIE } from "./auth";
import type { Env } from "./db";
import { json } from "./http";

const CSP =
  "default-src 'self'; frame-src https://www.youtube.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'";
// 'unsafe-inline' style is needed today: Tailwind v4 injects <style> in dev and
// the build can emit inline assets (design D4); revisit when removing.

/** Applied to EVERY response — API 200/401, redirects and asset passthrough. */
export const securityHeaders = createMiddleware(async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set("Content-Security-Policy", CSP);
  h.set("X-Content-Type-Options", "nosniff");
  // strict-origin-when-cross-origin: sin esta, el embed de YouTube llega sin
  // Referer y el player bloquea el vídeo ("This content is blocked...").
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
});

/** Origen permitido para esta petición, o null (fail closed sin WEB_ORIGIN). */
function allowedOrigin(c: Context<{ Bindings: Env }>): string | null {
  const origin = c.req.header("origin");
  if (!origin) return null;
  const list = (c.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(origin) ? origin : null;
}

function withCors(headers: Headers, origin: string): void {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  headers.set("Access-Control-Allow-Headers", "content-type");
  headers.append("Vary", "Origin");
}

/**
 * B' (dos despliegues): la web y la API son Workers con orígenes distintos, así
 * que la API autoriza los orígenes de la web declarados en WEB_ORIGIN y acepta
 * credenciales (la cookie de sesión viaja en la petición cross-origin).
 * El preflight se contesta antes del gate de sesión: no lleva cookie.
 */
export const cors = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const origin = allowedOrigin(c);
  if (c.req.method === "OPTIONS") {
    const res = new Response(null, { status: 204 });
    if (origin) withCors(res.headers, origin);
    return res;
  }
  await next();
  if (origin) withCors(c.res.headers, origin);
});

async function hasValidSession(
  c: Context<{ Bindings: Env }>,
): Promise<boolean> {
  const secret = c.env.AUTH_SECRET;
  // Missing secret fails closed: no key ⇒ no verifiable cookie ever.
  if (!secret) return false;
  return (
    (await readSessionToken(secret, getCookie(c, SESSION_COOKIE))) !== null
  );
}

/**
 * Gate on /api/*: only the auth endpoints (they are the session lifecycle) and
 * GET /api/health (deploy probe) stay open. The gate runs BEFORE routing, so
 * unknown /api paths answer 401, not 404, when anonymous.
 */
export const authGuard = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const { pathname } = new URL(c.req.url);
    const method = c.req.method;
    if (!pathname.startsWith("/api/")) return next();
    if (method === "GET" && pathname === "/api/health") return next();
    if (pathname.startsWith("/api/auth/")) return next();
    if (!(await hasValidSession(c)))
      return json({ error: "Unauthorized" }, 401);
    return next();
  },
);
