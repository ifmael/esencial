# Tasks — CM1 migración a Cloudflare

## 1. Scaffold nuevo (agentes, TDD donde aplique)
- [ ] 1.1 npm workspaces raíz (`web/`, `api/`), `wrangler.toml` con binding D1 + assets SPA
- [ ] 1.2 `api/`: Hono app con healthcheck; middleware de errores con envelope estándar
- [ ] 1.3 `web/`: Vite + React 19 + Tailwind 4 + react-router; port de Shell y Día placeholder con tokens DESIGN.md

## 2. Port de la capa de datos (TDD)
- [ ] 2.1 `schema.sql` adaptado (sin pragmas, idempotente) + script `wrangler d1 execute`
- [ ] 2.2 RED+GREEN: port de las 13 rutas a D1 (batch para transacciones), reutilizando `api-validation.ts`
- [ ] 2.3 Suite API con vitest-pool-workers sobre D1 local real: parity E1 (400 envelopes, 409 dup, cascade, last-values, read-only)

## 3. Integración SPA + Worker
- [ ] 3.1 `wrangler dev` sirve API + SPA juntos; Vite proxy `/api` para hot reload
- [ ] 3.2 Deep links (`/plan-recetas`) y assets funcionan (single-page-application fallback)

## 4. Verificación
- [ ] 4.1 Suite completa verde sin red; `npm run build` verde
- [ ] 4.2 Journey E1 completo contra `wrangler dev` (receta→plan→sesión→log→409→last-values→delete→slot vacío)
- [ ] 4.3 Checklist de deploy documentado (d1 create/execute/deploy) — ejecución con la cuenta del usuario
- [ ] 4.4 Borrar `legacy/next-app/`, actualizar project-site tree, archivar change, evaluación conjunta
