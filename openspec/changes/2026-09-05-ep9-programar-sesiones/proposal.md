# Proposal — EP9 programar sesiones: schedule desde UI + tarjeta Día con ejercicios

## Why

El flujo de fuerza diseñado (planificar plantilla → ver en Hoy → registrar) está roto en
uso normal: `POST /api/plan-sessions` existe y está testeado
(`api/tests/sessions-logs.test.ts:37-59`), pero **ningún componente del SPA lo llama**.
`/plan-fuerza` solo hace CRUD de plantillas; el estado vacío de la tarjeta FUERZA enlaza
a `/plan-fuerza`, que no permite programar una fecha → callejón sin salida. Además, la
tarjeta FUERZA del wireframe `esencial_hoy_desktop_v2` lista los ejercicios de la sesión
numerados, y `GET /api/day/:date` no los devuelve (solo `templateName` + `status`).

## What Changes

- **`GET /api/day/:date` enriquecido** (aditivo): `session` incluye ahora
  `exercises: [{ exerciseId, exerciseName, position }, ...]` — los ejercicios de la
  plantilla programada, ordenados por `position`. Array vacío cuando no hay.
- **Tarjeta FUERZA en `/`** (`web/src/routes/dia.tsx` `StrengthSection`): en estado
  `planned`, bajo el nombre de plantilla, lista numerada de ejercicios (número + nombre),
  según wireframe. Estados `null` y `logged` sin cambios.
- **Control "Programar" en `/plan-fuerza`** (`web/src/routes/plan-fuerza.tsx`
  `TemplateCard`): botón que abre un bloque inline con `<input type="date">` nativo +
  confirmación → `POST /api/plan-sessions {date, templateId}`. 201 → confirmación
  "Programada para <fecha>"; 409 → "Ya hay una sesión ese día"; 400 → mensaje del
  envelope `{ error, field }`.

## Scope

- Files: `api/src/routes/day.ts` + `api/tests/day.test.ts`;
  `web/src/lib/day.ts`, `web/src/routes/dia.tsx` + `web/tests/day-page.test.tsx`;
  `web/src/routes/plan-fuerza.tsx` + `web/tests/plan-fuerza.test.tsx`.
- Non-goals: DELETE de `plan-sessions` (desprogramar), duración estimada "45-60 min" del
  wireframe (no hay columna en schema; otro change), botón de programación en la propia
  tarjeta de Hoy, RECETA card, cualquier cambio de schema.

## Risks

- Bajo: el endpoint es aditivo (campo nuevo en `session`); los consumidores actuales
  (`sesion.tsx`) ignoran el campo extra. Rollback = revert commits.
- 409 de fecha duplicada ya tiene contrato testeado; la UI solo añade presentación.

## Decision

Approve to proceed (plan aprobado por el usuario en sesión).
