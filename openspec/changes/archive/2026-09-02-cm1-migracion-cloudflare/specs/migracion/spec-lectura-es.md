# Spec — CM1 migración (traducción de lectura)

> Versión legible del spec oficial (spec.md, inglés — el documento válido).

## 1. El Worker sirve todo
Un único Worker de Cloudflare: sirve la SPA (React+Vite compilada) y la API en `/api/*`. Deep links funcionan (`/plan-recetas` directo). La SPA conserva la shell de E0 (sidebar/tabs) y el placeholder DÍA con fecha navegable.

## 2. La API se comporta exactamente igual que E1
Mismas 13 rutas, mismos códigos, mismos errores `{ error, campo? }`, misma validación Zod. El journey de E1 (receta → plan → sesión → registro → 409 duplicado → últimos valores → borrar receta → slot vacío) debe reproducirse idéntico contra el Worker.

## 3. Base de datos: D1 de Cloudflare
Mismo esquema SQLite de E1 (14 tablas), aplicado con script idempotente. SQL portado a la API async de D1; nada de better-sqlite3.

## 4. Desarrollo local sin cuenta de Cloudflare
`wrangler dev` levanta API + SPA + D1 local juntos. `npm run dev` (Vite) con proxy para hot reload. Un checkout limpio funciona sin login.

## 5. Tests equivalentes
La suite de API corre contra D1 local REAL (no mocks): envelopes 400, 409, cascade, last-values, día read-only. UI tests para shell, fecha y estados. Todo verde sin red.

## 6. Deploy
Checklist documentado: crear D1, aplicar esquema, `wrangler deploy`. Verificado en tu cuenta (URL workers.dev) con el journey real y datos que persisten.
