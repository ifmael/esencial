# ADR-0008 — Dos Workers B' para el SPA y la API

- **Estado:** Aceptada
- **Fecha:** 2026-09-19

## Contexto

La app necesita servir un SPA y una API sobre Cloudflare. Un solo Worker puede
hacer las dos cosas, pero mezcla el ciclo de vida de los assets con el de los
datos y obliga a que cualquier cambio de la API vuelva a publicar el frontal. El
repo ya tenía un Worker monolítico y la separación se hizo para que cada parte
tuviera su configuración, su despliegue y sus permisos.

## Decisión

Hay **dos Workers** (B'):

- `esencial` sirve `web/dist` con `run_worker_first` y aplica las cabeceras de
  seguridad (CSP, `nosniff` y `Referrer-Policy`) a todas las respuestas. No
  expone rutas `/api/*`: las que lleguen ahí responden 404 JSON.
- `esencial-api` ejecuta Hono, monta D1 y R2 y responde `/api/*`. No sirve
  assets.

El navegador llama a la API **directamente**, con `VITE_API_URL` y
`credentials: "include"`. El frontal autoriza el origen de la API en su CSP
(`API_ORIGIN`) y la API autoriza el origen del frontal en CORS
(`WEB_ORIGIN`); los dos valores tienen que cuadrar. El despliegue manual publica
primero la API y después el frontal; los previews despliegan una pareja de
Workers y Access cubre las dos URLs.

## Alternativas

- **Un Worker monolítico:** simplifica el despliegue y evita CORS, pero acopla
  assets y API, impide desplegar y revertir cada parte por separado y concentra
  los bindings de datos en el Worker que sirve HTML.
- **API en un servidor tradicional:** permite otro runtime, pero añade una
  máquina, otro despliegue y otro origen que mantener; el repo ya vive en
  Cloudflare.
- **SPA y API en el mismo origen mediante rutas:** evita CORS, pero vuelve al
  monolito y hace que el Worker del frontal tenga que conocer los bindings de
  datos.

## Consecuencias

- CORS, CSP y cookies entre orígenes son parte del contrato; un cambio de
  subdominio exige tocar `WEB_ORIGIN` y `API_ORIGIN`.
- Cada Worker se despliega y se revierte por separado. Un merge publica los dos
  con Workers Builds y el orden de los builds no está garantizado.
- Los previews necesitan dos URLs coordinadas: la web apunta a la API de su
  preview y la API autoriza esa web.
- Access tiene que proteger los dos hosts; no basta con proteger el frontal.

## Referencias

- `wrangler.toml` y `api/wrangler.toml` (assets, bindings y variables).
- `web/worker/index.ts` (CSP y 404 de `/api/*`).
- `api/src/middleware.ts` (CORS y cabeceras).
- `DEPLOY.md`, «Deploy»; `docs/flujo.md`, «Preview por rama (M5a)».
