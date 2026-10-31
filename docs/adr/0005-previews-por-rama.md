# ADR-0005 — Previews por rama con D1/R2 compartidos y Access

- **Estado:** Aceptada
- **Fecha:** 2026-10-24

## Contexto

Validar una PR en local no prueba la integración real de los dos Workers, D1, R2
ni Cloudflare Access. Se necesita una URL por tarea con datos inventados, sin
tocar producción y sin crear una pareja de recursos por PR. El flujo es de un
solo operador y las previews son efímeras.

## Decisión

Cada tarea despliega una pareja de previews con `wrangler preview`:
`<clave>-esencial` y `<clave>-esencial-api`, con nombres y URLs predecibles. Las
dos usan la D1 `esencial-preview` y el R2 `esencial-photos-preview`, compartidos
por todas las previews y nunca los de producción. Las migraciones se aplican en
cada preview y deben ser aditivas. La siembra de sesiones de ejemplo es
idempotente y usa el usuario que ya exista.

Access cubre las previews con la app `all_preview_workers`. Como `ctx.access`
llega `undefined` en las Preview URLs, la API valida el `Cf-Access-Jwt-Assertion`
contra el JWKS del equipo (`TEAM_DOMAIN` + `POLICY_AUD`). La cookie es por host;
el puente `/api/session/return` autentica primero el host de la API y vuelve a la
web. La app de previews necesita **«Bypass OPTIONS requests»**
(`options_preflight_bypass`); sin eso, el preflight CORS de la API responde 403.
El smoke del borde (302 de Access) es obligatorio; el smoke autenticado con
`CF_ACCESS_COOKIE` es opcional para no bloquear previews sin cookie.

## Alternativas

- **D1/R2 aislados por PR:** evita colisiones, pero crea y borra recursos en cada
  tarea y agota antes los límites de Cloudflare.
- **Datos de producción:** valida con datos reales, pero expone y puede corromper
  producción; descartado.
- **Sin preview:** obliga a validar en local y no prueba Access ni los orígenes
  cruzados.

## Consecuencias

- Una pareja de recursos basta para un operador; el coste y la limpieza son
  manejables.
- Las previews comparten datos: una sesión de ejemplo puede aparecer en otra PR y
  no se pueden probar migraciones destructivas.
- El aislamiento real queda en las URLs y los Workers, no en la base.
- Access y la cookie por host añaden complejidad; el puente, el preflight sin
  autenticación y el smoke reducen el riesgo de una preview que parece vacía.
- `clean` borra los dos previews; si se recrea el R2 de preview hay que volver a
  copiar las fotos.

## Referencias

- `TODO-flujo-agentes.md`, M5a y M6 (preview útil).
- `docs/flujo.md`, «Preview por rama (M5a)».
- `orquestator-cli/lib/preview.mjs`.
