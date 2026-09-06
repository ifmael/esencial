// E7 middlewares (design D4): security headers on every response, the 401 gate
// on /api/*, and the page guard that redirects unauthenticated HTML to /login.
// Order at the app root: securityHeaders → authGuard → pageGuard.
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "./db";
import { json } from "./http";
import { readSessionToken, SESSION_COOKIE } from "./auth";

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

/**
 * Page guard (requires run_worker_first in wrangler.toml): non-API paths
 * without a session see 302 → /login?next=<path>. /login and static assets
 * (dotted paths — the JS/CSS needed to render the login card) pass through.
 * Protecting the HTML is UX; the data boundary is authGuard (design D4).
 */
export const pageGuard = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const { pathname } = new URL(c.req.url);
    if (pathname.startsWith("/api/")) return next();
    if (pathname === "/login") return next();
    if (/\.[a-z0-9]+$/i.test(pathname)) return next(); // hashed static assets
    if (await hasValidSession(c)) return next();
    return c.redirect(`/login?next=${encodeURIComponent(pathname)}`, 302);
  },
);
