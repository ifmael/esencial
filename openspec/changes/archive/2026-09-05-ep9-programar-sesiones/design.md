# Design — EP9 programar sesiones

## Decisions

### D1: Enriquecer `GET /api/day/:date`, no segundo fetch del cliente
La tarjeta necesita los ejercicios; dos opciones: (a) el SPA pide
`GET /api/templates/:id` al montar (lo hace `sesion.tsx`), o (b) el endpoint del día
incluye los ejercicios. Se elige (b): un solo round trip, el card es de solo-lectura
y el patrón de agregación server-side ya es el contrato del endpoint (E5 D1). La
alternativa (a) añadiría un fetch condicional y un estado de carga extra a la tarjeta
por un join de una query.

Query añadida en `api/src/routes/day.ts` (solo cuando hay sesión):
```sql
SELECT te.exercise_id AS exerciseId, te.position, e.name AS exerciseName
FROM plan_sessions ps
JOIN template_exercises te ON te.template_id = ps.template_id
JOIN exercises e ON e.id = te.exercise_id
WHERE ps.date = ?
ORDER BY te.position
```
`session.exercises` siempre es array (`[]` si no hay filas). Sin cambios de schema:
todo son tablas existentes (`plan_sessions`, `template_exercises`, `exercises`).

### D2: `exercises` es opcional en el tipo cliente, requerido en la respuesta
`DaySession` en `web/src/lib/day.ts` gana
`exercises?: { exerciseId: number; exerciseName: string; position: number }[]`.
Opcional en TS para no romper los mocks de tests existentes que no lo envían; el
endpoint siempre lo envía. Renderizado: lista numerada solo cuando
`status === "planned" && exercises.length > 0`; `logged` conserva su summary verde
(los ejercicios ya están dentro del resumen).

### D3: Programar vive en `TemplateCard` en `/plan-fuerza`, no en un modal global
La acción es por plantilla; el card ya es el ancla natural (Editar/Duplicar/Eliminar
viven ahí). Bloque colapsable con estado local `scheduling`:
- botón "Programar" → muestra `<input type="date">` nativo + "Confirmar"/"Cancelar"
- confirmar → `POST /api/plan-sessions { date, templateId }` vía helpers existentes
  de `web/src/lib/api.ts`
- 201 → mensaje inline "Programada para <fecha>" (y el bloque se cierra)
- 409 → "Ya hay una sesión ese día" (el envelope trae `{ error, field: "date" }`)
- 400 → se muestra `error` del envelope
Patrón de manejo de error igual a `useMealPlan.save` (`plan-recetas.tsx:44-63`).
Sin librerías nuevas; `input type="date"` nativo (decisión E5).

### D4: No se toca la tarjeta de Hoy como punto de programación
El estado vacío de FUERZA sigue enlazando a `/plan-fuerza`, que ahora sí resuelve el
trabajo. Fuera de alcance un date-picker en la tarjeta.

### D5: TDD plan (strict RED→GREEN)
- API RED: `api/tests/day.test.ts` — programar plantilla con 2 ejercicios vía
  `POST /api/plan-sessions`, `GET /api/day/:date` devuelve `session.exercises`
  ordenado por `position`.
- Web RED: `web/tests/day-page.test.tsx` — mock con `exercises` de 4 items → 4
  listitems numerados en FUERZA; caso `exercises` ausente/`[]` → tarjeta válida.
- Web RED: `web/tests/plan-fuerza.test.tsx` — botón "Programar" → input date → POST →
  201 mensaje / 409 mensaje.
Comandos: `pnpm --filter api test -- day`, `pnpm --filter web test -- day-page`,
`pnpm --filter web test -- plan-fuerza`.

## Migration notes
No schema changes. Rollback = revert commits; el campo nuevo del endpoint es aditivo.
