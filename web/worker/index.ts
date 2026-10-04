// Worker del frontal (B'): sirve los assets del SPA. La API vive en otro Worker,
// en otro origen: el navegador la llama directo (CORS) y aquí no hay rutas
// /api/* propias. `run_worker_first` en la configuración hace que este Worker
// vea todas las peticiones, que es lo que permite fijar las cabeceras de
// seguridad en cada respuesta.
import { Hono } from "hono";

export interface WebEnv {
  /** Binding de assets de wrangler ([assets] binding): sirve ./web/dist. */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Origen público de la API: se autoriza en la CSP. */
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

const app = new Hono<{ Bindings: WebEnv }>()
  // Dev: el navegador trata `localhost` y `127.0.0.1` como dos sitios distintos,
  // así que se fija un origen canónico (en producción el host nunca es
  // `localhost`).
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
  // Todo lo demás son assets. Se re-envuelve la respuesta porque la de los
  // assets trae cabeceras inmutables y las de arriba necesitan escribirlas.
  .all("*", async (c) => {
    const asset = await c.env.ASSETS.fetch(c.req.raw);
    return new Response(asset.body, asset);
  });

export default app;
