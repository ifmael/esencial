# Tasks — CM1 migración a Cloudflare

## 1. Scaffold nuevo (agentes, TDD donde aplique)
- [x] 1.1 npm workspaces raíz (`web/`, `api/`), `wrangler.toml` con binding D1 + assets SPA
- [x] 1.2 `api/`: Hono app con healthcheck; middleware de errores con envelope estándar
- [x] 1.3 `web/`: Vite + React 19 + Tailwind 4 + react-router; port de Shell y Día placeholder con tokens DESIGN.md

## 2. Port de la capa de datos (TDD)
- [x] 2.1 `schema.sql` adaptado (sin pragmas, idempotente) + script `wrangler d1 execute`
- [x] 2.2 RED+GREEN: port de las 13 rutas a D1 (batch para transacciones), reutilizando `api-validation.ts`
- [x] 2.3 Suite API con vitest-pool-workers sobre D1 local real: parity E1 (400 envelopes, 409 dup, cascade, last-values, read-only)

## 3. Integración SPA + Worker
- [x] 3.1 `wrangler dev` sirve API + SPA juntos; Vite proxy `/api` para hot reload
- [x] 3.2 Deep links (`/plan-recetas`) y assets funcionan (single-page-application fallback)

## 4. Verificación
- [x] 4.1 Suite completa verde sin red; `npm run build` verde
- [x] 4.2 Journey E1 completo contra `wrangler dev` (agente) + re-verificación independiente del orquestador: receta→plan→sesión→log 201→dup 409→last-values 60×10→delete→slot vacío; UNIQUE→400 {field name}; deep links y assets 200; notes upsert OK; schema idempotente (14 tablas al 2º pase)
- [x] 4.3 Checklist de deploy documentado en `DEPLOY.md` (login, d1 create + database_id, migrate:remote, deploy, verificación post-deploy, rollback) — ejecución pendiente de la cuenta del usuario
- [x] 4.4 Deploy verified by user ("Deploy hecho y funcionando"); legacy/next-app/ deleted (incl. untracked test DB); project-site updated; change archived below
