# Diseño: rejilla semanal para el plan de fuerza

Fecha: 2026-09-07
Estado: aprobado en chat, pendiente de revisión por el usuario

## Contexto

Hoy las sesiones de fuerza se programan desde la tarjeta de cada plantilla en
`/plan-fuerza` (botón "Programar" + `<input type="date">`): un POST a
`/api/plan-sessions` con `{ date, templateId }`. La BD impone una sesión por
día (`plan_sessions.date UNIQUE`) y el estado va `planned` → `logged` cuando se
registra el entrenamiento (`workout_logs` cuelga de la sesión con FK RESTRICT).

Problemas: no hay visión de conjunto de la semana, no existe forma de
desprogramar una sesión, y programar fecha a fecha no da contexto.

## Objetivo

Añadir un **calendario semanal** en `/plan-fuerza` —como el del plan de
recetas— donde cada día recibe como mucho una plantilla de entrenamiento.
La rejilla pasa a ser la única superficie de programación.

## Decisiones (acordadas)

- **Una plantilla al día** como ahora: sin migración, `plan_sessions` intacto.
- **Solo plantillas**: los ejercicios sueltos por día quedan fuera de esta
  ronda (posible ronda futura, requiere nueva tabla + cambios en logs).
- **El botón "Programar" de las tarjetas se elimina**: un solo camino hacia
  `plan_sessions` (cutover limpio).
- **Fuera de alcance**: mover/intercambiar sesiones, marcar "perdida",
  desplazar la semana, copiar semana anterior, varias sesiones al día. Ronda 2.

## UX

Rejilla semanal arriba de `/plan-fuerza`, una fila de "sesión" ×
Lunes→Domingo, con navegación ‹ semana › (`currentIsoWeek`/`shiftIsoWeek`).

- Celda vacía → tap → picker de plantillas (patrón `RecipePicker`) → POST.
- Celda con sesión `planned` → badge "Pendiente" + botón ✕ para desprogramar
  (DELETE). La ✕ pide confirmación inline (patrón `confirming` existente).
- Celda con sesión `logged` → badge "Hecho", solo lectura.
- La celda de "hoy" queda marcada.
- Debajo, las tarjetas de plantilla siguen igual, sin bloque "Programar".

## API

Incremental, no PUT semanal (a diferencia de `meal-plan.ts`): `plan_sessions`
puede tener `workout_logs` colgando (FK RESTRICT), así que reemplazar la semana
borrando/reinsertando rompería con sesiones logged. Operaciones por fila:

- `GET /api/plan-sessions` — ya existe; la rejilla filtra por semana ISO en
  cliente (volumen pequeño).
- `POST /api/plan-sessions` — ya existe; 409 "Ya hay una sesión ese día".
- `DELETE /api/plan-sessions/:id` — **nuevo**. Solo `status='planned'`;
  409 si `logged`; 404 si no existe.

Cero migraciones; esquema intacto.

## Archivos

| Archivo | Cambio |
|---|---|
| `web/src/lib/plan-week.ts` | Nuevo hook (patrón `useMealPlan`): fetch sesiones, filtro semana, create/remove + reload |
| `web/src/components/week-grid.tsx` | Rejilla semanal + picker de plantillas |
| `web/src/routes/plan-fuerza.tsx` | Monta la rejilla; borra bloque "Programar" de `TemplateCard` (~60 líneas) |
| `api/src/routes/plan-sessions.ts` | Añade DELETE |
| `api/tests/` | Tests del DELETE (TDD RED→GREEN) |

## Errores y bordes

- Día ocupado → 409 con mensaje existente.
- `logged`: ni se borra ni se toca desde la rejilla.
- Semanas pasadas/futuras navegables libremente.
- Si la semana mostrada incluye sesiones de plantillas borradas: la JOIN de
  `GET /api/plan-sessions` ya filtra (INNER JOIN); celda vacía. No es caso
  especial nuevo.

## Testing

- TDD estricto por convención del repo: primero el test del DELETE que falla
  (planned → 200, logged → 409, inexistente → 404), luego implementación.
- Web no tiene suite de UI: verificación manual con `pnpm dev` (rejilla,
  añadir, desprogramar, badges, navegación de semanas, día de hoy).