# Tasks: Planificador semanal de fuerza

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450 (1 endpoint, 1 hook, 1 componente, cutover tarjeta, tests) |
| 400-line budget risk | Medium |
| Delivery strategy | direct commits en branch del worktree (sin PR) |

## Phase 1: TDD RED (t1)

- [ ] 1.1 Test API `api/tests/plan-sessions-delete.test.ts`: DELETE
      planned→200, logged→409, inexistente→404 (patrón
      `api/tests/sessions-logs.test.ts` + `helpers.ts`).
- [ ] 1.2 Test web `web/src/tests/plan-week.test.tsx`: hook `usePlanWeek` —
      filtro semana / create / remove (patrón `meal-plan.test.tsx` +
      `api-mock.ts`).
- [ ] 1.3 `pnpm test` (api y web) — confirmar ROJO en ambos; commit
      `test(planificador): tests RED del DELETE y del hook usePlanWeek`.

## Phase 2: Backend (t2)

- [ ] 2.1 `DELETE /api/plan-sessions/:id` en
      `api/src/routes/plan-sessions.ts`: `planned`→200 `{}`; `logged`→409
      `fail("Sesión ya registrada", undefined, 409)`; inexistente→404. Sin
      migraciones.
- [ ] 2.2 (GREEN) tests API verdes; commit
      `feat(api): DELETE plan-sessions (desprogramar planned)`.

## Phase 3: Frontend (t3)

- [ ] 3.1 Hook `web/src/lib/plan-week.ts` (`usePlanWeek`, patrón `useMealPlan`).
- [ ] 3.2 Rejilla `web/src/components/week-grid.tsx`: L-D, nav ‹› con
      `currentIsoWeek`/`shiftIsoWeek`, hoy marcado, picker de plantillas en
      celda vacía, "Pendiente"+✕ con confirmación inline, "Hecho" solo lectura.
- [ ] 3.3 `plan-fuerza.tsx`: monta la rejilla; BORRA el bloque "Programar" de
      `TemplateCard` (estado `scheduling/date/scheduled/scheduleError`) y sus
      referencias.
- [ ] 3.4 (GREEN) tests web verdes; commit
      `feat(web): rejilla semanal de fuerza con desprogramación`.

## Phase 4: QA (t4)

- [ ] 4.1 Revisión diff backend+frontend vs spec superpowers + spec delta:
      criterios cubiertos, sin dead code del bloque "Programar", patrones del
      repo, copy español.
- [ ] 4.2 Ejecutar `pnpm test` y `pnpm build`; escribir
      `verify-report.md` (patrón
      `openspec/changes/archive/2026-09-06-fase2-typecheck/verify-report.md`);
      commit `chore(openspec): verify planificador-semanal`.

## Phase 5: E2E + cierre (t5)

- [ ] 5.1 Describe "PLANIFICADOR SEMANAL" en `e2e/tests/strength.spec.ts`:
      añadir plantilla desde rejilla, desprogramar con ✕, 409 al ocupar día
      ocupado, badge "Hecho" tras registrar sesión, navegación semanas.
- [ ] 5.2 `npx playwright test tests/strength.spec.ts` (desde `e2e/`) verde;
      adjuntar resultados al verify-report.
- [ ] 5.3 Merge a `main` (local), archivar change (promover spec a
      `openspec/specs/planificador-semanal/spec.md`), commit final. Push solo
      bajo petición del usuario.
