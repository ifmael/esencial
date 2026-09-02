# Design — CM1 migración a Cloudflare

## Decisions

### D1: Monorepo con 2 paquetes (web, api) + wrangler en raíz
`web/` (Vite+React+Tailwind) y `api/` (Hono) como npm workspaces. Un solo Worker: Hono monta la API en `/api/*` y `wrangler.toml` configura `assets.directory = web/dist` con `not_found_handling = "single-page-application"` (deep links funcionan sin reescribir el servidor). Sin CORS: mismo origen.

### D2: Hono como framework de API
Corre nativo en Workers (Web estándar Request/Response — como ya escribimos en E1), tipado, `hono/zod-validator` reutiliza los esquemas E1 tal cual. Middleware `onError` centraliza el envelope `{ error, field? }` (400 fail-closed, 409 conflicto, 500 genérico).

### D3: Capa de datos async sobre D1
`api/src/db.ts` define el tipo `Env { DB: D1Database }`. Los 23 `prepare()` de E1 se portan a D1: `.prepare(sql).bind(...args)` + `.all()` (listas) / `.run()` (mutaciones) / `.first()` (únicos). Transacciones multi-statement (recipe PUT, workout log close) → `db.batch([...])` (D1 es transaccional por batch). `schema.sql` se ejecuta con `wrangler d1 execute --local` en dev y remoto en deploy; pragmas eliminados (D1 gestiona WAL solo).

### D4: Front: react-router + ports de E0
react-router 7 (SPA mode). Shell (sidebar/tabs) y DayHeader se portan de `legacy/next-app` sin cambios de diseño (Tailwind v4 `@theme` tokens ya en CSS plano). `useRecipes` y hooks de datos se escriben en E2 directamente para el nuevo stack.

### D5: Testing: pool de workers con D1 real
`@cloudflare/vitest-pool-workers` ejecuta los tests de API dentro de miniflare con D1 local real (mismos casos que E1: envelopes, 409, cascade, last-values, read-only). `web/` usa vitest + testing-library (shell, date header, estados). Pin exacto de versiones.

### D6: Nombres y convención
Paquetes `@esencial/web` y `@esencial/api`. Scripts raíz: `dev` (wrangler dev), `build` (vite build), `test`, `deploy` (wrangler deploy tras build). D1 database name: `esencial`, binding `DB`.

## Migration notes
- `legacy/next-app/` se conserva hasta verificación CM1; se borra en el cierre del change.
- D1: `wrangler d1 create esencial` + `wrangler d1 execute esencial --file=api/schema.sql` (remote) — checklist documentado; el deploy real lo ejecuta el usuario (login de su cuenta) con verificación conjunta.
