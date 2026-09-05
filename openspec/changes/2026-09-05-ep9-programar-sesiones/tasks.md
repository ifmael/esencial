# Tasks — EP9 programar sesiones

> Strict TDD: RED (test que falla) → GREEN (implementación mínima) en cada tarea.
> Comandos: `pnpm --filter api test -- day`, `pnpm --filter web test -- day-page`,
> `pnpm --filter web test -- plan-fuerza`.

## 1. API: ejercicios en `GET /api/day/:date`
- [x] 1.1 RED: `api/tests/day.test.ts` — seed plantilla con 2+ ejercicios vía endpoints públicos, POST `/api/plan-sessions {date:"2026-09-02"}`, GET day → `session.exercises` ordenado por `position`; confirmar fallo
- [x] 1.2 GREEN: `api/src/routes/day.ts` — query JOIN `template_exercises`+`exercises` WHERE `ps.date = ?` ORDER BY `te.position`; `exercises: []` cuando no hay

## 2. Web: tarjeta FUERZA con ejercicios
- [x] 2.1 RED: `web/tests/day-page.test.tsx` — mock con `exercises` (4 items) → 4 listitems numerados en FUERZA
- [x] 2.2 RED: caso `exercises` ausente/`[]` → tarjeta válida sin lista
- [x] 2.3 GREEN: `web/src/lib/day.ts` (tipo `exercises?`) + `web/src/routes/dia.tsx` `StrengthSection` lista numerada en planned

## 3. Web: Programar desde `/plan-fuerza`
- [x] 3.1 RED: `web/tests/plan-fuerza.test.tsx` — botón "Programar" → input date nativo → POST `/api/plan-sessions`; 201 → "Programada para <fecha>"; 409 → "Ya hay una sesión ese día"
- [x] 3.2 GREEN: `web/src/routes/plan-fuerza.tsx` `TemplateCard` — bloque colapsable scheduling, envelope `{error, field}` para 400/409 (patrón `useMealPlan.save`)

## 4. Verify & close
- [x] 4.1 `pnpm test` completo + `pnpm build` verdes
- [x] 4.2 E2E manual (pnpm dev): login → programar hoy en /plan-fuerza → tarjeta FUERZA en / con sesión + ejercicios numerados → reintento misma fecha (409) → comparar con wireframe `esencial_hoy_desktop_v2`
- [ ] 4.3 `verify-report.md` + commit conventional (reporte escrito; commit pendiente)
