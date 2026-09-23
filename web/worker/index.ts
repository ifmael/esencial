// Worker del frontal (B'): sirve los assets del SPA y hace el guard del HTML.
// La API vive en otro Worker, en otro origen: el navegador la llama directo
// (CORS con credenciales) y aquí no hay rutas /api/* propias. `run_worker_first`
// en la configuración hace que este Worker vea todas las peticiones, que es lo
// que permite gatear el HTML antes de servirlo.
import { Hono } from "hono";

export interface WebEnv {
  /** Binding de assets de wrangler ([assets] binding): sirve ./web/dist. */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Origen público de la API: se autoriza en la CSP y se le pregunta por la sesión. */
  API_ORIGIN?: string;
}

// 'unsafe-inline' en style hace falta hoy: Tailwind v4 inyecta <style> en dev y
// el build puede emitir inline (design D4); revisar al quitarlo.
const csp = (apiOrigin?: string): string => {
  const api = apiOrigin ? ` ${apiOrigin}` : "";
  return [
    "default-src 'self'",
    "frame-src https://www.youtube.com",
    `img-src 'self' data: blob:${api}`,
    `connect-src 'self'${api}`,
    "style-src 'self' 'unsafe-inline'",
  ].join("; ");
};

/**
 * La sesión la valida la API, única dueña de la firma: aquí solo se reenvía la
 * cookie a `GET /api/auth/status`. Antes cada Worker comprobaba la cookie con su
 * copia de `AUTH_SECRET`, y dos copias se desincronizan (basta un `secret put`
 * en un solo Worker): el guard rechazaba cookies válidas y en producción se veía
 * como un cierre de sesión en cada recarga de la página.
 *
 * Fail closed: sin origen de la API, sin cookie o sin un 200 con
 * `authenticated: true`, no se sirve el HTML (la pantalla de `/login` sí).
 */
async function hasValidSession(env: WebEnv, req: Request): Promise<boolean> {
  const cookie = req.headers.get("cookie");
  // Sin cookie no hay sesión que preguntar (y ahorra la subpetición).
  if (!cookie || !env.API_ORIGIN) return false;
  try {
    const res = await fetch(`${env.API_ORIGIN}/api/auth/status`, {
      headers: { cookie },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { authenticated?: boolean };
    return body.authenticated === true;
  } catch {
    // API inalcanzable: sin verificación no se sirve la app (fail closed).
    return false;
  }
}

const app = new Hono<{ Bindings: WebEnv }>()
  // Dev: el navegador trata `localhost` y `127.0.0.1` como dos sitios distintos,
  // y la cookie de sesión (SameSite=Lax, la emite la API en 127.0.0.1) no viaja
  // de uno al otro: el login se quedaría en /login sin decir nada. En vez de
  // duplicar CORS (WEB_ORIGIN) y CSP (API_ORIGIN) para los dos nombres, se fija
  // un origen canónico. En producción el host nunca es `localhost`.
  .use(async (c, next) => {
    const url = new URL(c.req.url);
    if (url.hostname !== "localhost") return next();
    url.hostname = "127.0.0.1";
    return c.redirect(url.toString(), 302);
  })
  // Cabeceras en TODAS las respuestas (200, 302 y assets).
  .use(async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set("Content-Security-Policy", csp(c.env.API_ORIGIN));
    h.set("X-Content-Type-Options", "nosniff");
    // Sin esta, el iframe de YouTube llega sin Referer y el player lo bloquea
    // ("This content is blocked. Contact the site owner to fix the issue.").
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  })
  // B': aquí no hay API. Un /api/* que llegue al frontal (una URL vieja, un
  // sondeo de salud) falla en claro con 404 JSON en vez de colarse por el
  // fallback del SPA y devolver HTML con 200.
  .use(async (c, next) => {
    if (new URL(c.req.url).pathname.startsWith("/api/")) {
      return c.json({ error: "Not found" }, 404);
    }
    return next();
  })
  // Guard del HTML (el pageGuard del monolito): solo las rutas sin punto (deep
  // links del SPA) comprueban sesión; /login y los assets hasheados pasan, que
  // son justo lo que hace falta para pintar la pantalla de login.
  .use(async (c, next) => {
    const { pathname } = new URL(c.req.url);
    if (pathname.startsWith("/api/")) return next();
    if (pathname === "/login") return next();
    if (/\.[a-z0-9]+$/i.test(pathname)) return next();
    if (await hasValidSession(c.env, c.req.raw)) return next();
    return c.redirect(`/login?next=${encodeURIComponent(pathname)}`, 302);
  })
  // Todo lo demás son assets. Se re-envuelve la respuesta porque la de los
  // assets trae cabeceras inmutables y las de arriba necesitan escribirlas.
  .all("*", async (c) => {
    const asset = await c.env.ASSETS.fetch(c.req.raw);
    return new Response(asset.body, asset);
  });

export default app;
