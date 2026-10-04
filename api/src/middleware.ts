// E7 middlewares (design D4): security headers on every response, CORS para el
// origen de la web y el 401 gate en /api/*. Orden en la raíz de la app:
// securityHeaders → cors → authGuard. El guard del HTML (302 → /login) vive en
// el Worker del frontal (B', dos despliegues).

import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { readSession } from "./auth";
import type { AppContext, Env, User } from "./db";
import { json } from "./http";
import { normalizeEmail, requestIdentity } from "./identity";
import { ensureUser } from "./repo";

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

/** ¿Trae cookie de sesión válida? Es el puente del SPA mientras siga con su
 *  propio /login; sin `AUTH_SECRET` falla cerrado (no hay cookie verificable). */
async function hasValidSession(c: Context<AppContext>): Promise<boolean> {
  const secret = c.env.AUTH_SECRET;
  if (!secret) return false;
  // El header entero: el navegador puede mandar varias cookies del mismo
  // nombre (una vieja del host y la compartida del dominio) y basta con que
  // una sea válida.
  return (await readSession(secret, c.req.header("cookie"))) !== null;
}

/** Usuario de la petición, o null. La identidad la prueba Access en el borde;
 *  mientras el frontal siga con su login, una cookie de sesión válida vale como
 *  el usuario legacy —el admin, que es el único de una instalación de uno—. Ese
 *  puente desaparece en cuanto el SPA borre /login y su guard. */
async function requestUser(c: Context<AppContext>): Promise<User | null> {
  const email = await requestIdentity(c);
  if (email) return await ensureUser(c.env.DB, email, c.env.ADMIN_EMAIL);
  if (!(await hasValidSession(c))) return null;
  const admin = normalizeEmail(c.env.ADMIN_EMAIL);
  return admin ? await ensureUser(c.env.DB, admin, admin) : null;
}

/**
 * Gate on /api/*: fija el usuario de la petición o corta con 401. Siguen
 * abiertos los endpoints de sesión (son su propio ciclo de vida) y GET
 * /api/health (sonda de deploy). La primera petición de un email autenticado
 * autoprovisiona su cuenta.
 */
export const identifyUser = createMiddleware<AppContext>(async (c, next) => {
  const { pathname } = new URL(c.req.url);
  const method = c.req.method;
  if (!pathname.startsWith("/api/")) return next();
  if (method === "GET" && pathname === "/api/health") return next();
  if (pathname.startsWith("/api/auth/")) return next();
  const user = await requestUser(c);
  if (!user) return json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  return next();
});
