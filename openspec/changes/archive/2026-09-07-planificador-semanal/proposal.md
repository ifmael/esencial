# Proposal: Planificador semanal de fuerza

## Intent

Las sesiones de fuerza se programan fecha a fecha desde la tarjeta de cada
plantilla (`/plan-fuerza`): sin visión de conjunto de la semana y sin forma de
desprogramar una sesión. Añadir una rejilla semanal (Lunes→Domingo) como única
superficie de programación y un `DELETE /api/plan-sessions/:id` para
desprogramar.

## Scope

### In Scope

- Rejilla semanal en `/plan-fuerza` con navegación ‹ semana ›
  (`currentIsoWeek`/`shiftIsoWeek`), celda de "hoy" marcada.
- Celda vacía → picker de plantillas → POST `/api/plan-sessions`.
- Celda `planned` → badge "Pendiente" + ✕ con confirmación inline → DELETE.
- Celda `logged` → badge "Hecho", solo lectura.
- `DELETE /api/plan-sessions/:id`: `planned`→200, `logged`→409, inexistente→404.
- Hook `usePlanWeek` (`web/src/lib/plan-week.ts`) siguiendo el patrón
  `useMealPlan`.

### Out of Scope

- Ejercicios sueltos por día (requiere nueva tabla + cambios en logs).
- Mover/intercambiar sesiones, marcar "perdida", desplazar la semana, copiar
  semana anterior, varias sesiones al día — ronda 2.
- Cero migraciones: el esquema `plan_sessions` queda intacto.

## Capabilities

### New Capabilities

- `planificador-semanal`: rejilla semanal L-D en `/plan-fuerza` como única
  superficie de programación de sesiones de fuerza, con desprogramación de
  sesiones `planned` vía `DELETE /api/plan-sessions/:id`.

### Modified Capabilities

Ninguna.

## Approach

Spec aprobado en `docs/superpowers/specs/2026-09-07-plan-fuerza-semanal-design.md`.
API incremental (no PUT semanal): `plan_sessions` puede tener `workout_logs`
colgando (FK RESTRICT), reemplazar la semana borrando/reinsertando rompería con
sesiones `logged`. La rejilla filtra por semana ISO en cliente (el GET ya
devuelve todas las sesiones con la JOIN de plantillas; volumen pequeño).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `api/src/routes/plan-sessions.ts` | Modified | añade DELETE |
| `api/tests/plan-sessions-delete.test.ts` | New | tests TDD del DELETE |
| `web/src/lib/plan-week.ts` | New | hook `usePlanWeek` |
| `web/src/components/week-grid.tsx` | New | rejilla semanal + picker |
| `web/src/routes/plan-fuerza.tsx` | Modified | monta rejilla; borra bloque "Programar" de `TemplateCard` |
| `web/src/tests/plan-week.test.tsx` | New | tests del hook (TDD) |
| `e2e/tests/strength.spec.ts` | Modified | describe "PLANIFICADOR SEMANAL" |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Regresión en flujos existentes de `/plan-fuerza` (chips A→B→C) | Low | tests existentes + E2E strength.spec.ts |
| 409 por día ocupado confunde al usuario | Low | mensaje existente "Ya hay una sesión ese día" visible en la rejilla |
| Dead code del bloque "Programar" | Low | QA revisa diff; cutover limpio |

## Rollback Plan

`git revert` de los commits del branch del worktree. Sin migraciones y sin
cambios de esquema: no hay datos que reparar. El endpoint GET/POST existente no
cambia de contrato.

## Dependencies

Ninguna nueva. Todo ya en el repo (vitest, playwright, Tailwind v4).

## Success Criteria

- [ ] `pnpm test` (raíz) verde, incluidos los tests TDD nuevos (API + hook).
- [ ] `pnpm build` verde.
- [ ] Playwright `e2e/tests/strength.spec.ts` verde con el describe nuevo.
- [ ] Rejilla visible en `/plan-fuerza` con hoy marcado; añadir, desprogramar y
      badges funcionan; tarjeta sin botón "Programar".
