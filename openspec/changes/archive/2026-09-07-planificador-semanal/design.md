# Design: Planificador semanal de fuerza

Referencia: `docs/superpowers/specs/2026-09-07-plan-fuerza-semanal-design.md`
(espec aprobada en chat). Este change implementa esa espec tal cual.

## Decisiones

### 1. API incremental, no PUT semanal

A diferencia de `meal-plan.ts` (que reemplaza la semana), aquí las operaciones
son por fila. Razón: `plan_sessions` puede tener `workout_logs` colgando (FK
RESTRICT); borrar/reinsertar la semana rompería con sesiones ya `logged`.

- `GET /api/plan-sessions` — existe; la rejilla filtra por semana ISO en
  cliente.
- `POST /api/plan-sessions` — existe; 409 "Ya hay una sesión ese día".
- `DELETE /api/plan-sessions/:id` — **nuevo**. Solo `status='planned'`;
  409 si `logged`; 404 si no existe.

### 2. Cero migraciones

Una plantilla al día ya lo impone `plan_sessions.date UNIQUE`. Esquema intacto;
`workout_logs` no se toca.

### 3. Cutover limpio de la UI

El botón "Programar" de las tarjetas se elimina junto con su estado
(`scheduling/date/scheduled/scheduleError`): un solo camino hacia
`plan_sessions` — la rejilla. Sin muertos ni dobles superficies.

### 4. Hook `usePlanWeek` espejo de `useMealPlan`

Mismo patrón que `web/src/routes/plan-recetas.tsx` (fetch + estado + reload),
pero sin PUT semanal. Contrato:

```ts
usePlanWeek(isoWeek: string) → {
  sessions: PlanSession[];
  loading: boolean;
  error: string | null;
  reload(): void;
  create(date: string, templateId: number): Promise<void>;
  remove(id: number): Promise<void>;
}
// PlanSession = { id, date, status: "planned"|"logged", templateId, templateName }
```

### 5. Rejilla en `week-grid.tsx`

Una fila Lunes→Domingo × columnas de sesión. Celda vacía → picker de plantillas
(patrón `RecipePicker`). `planned` → "Pendiente" + ✕ con confirmación inline
(patrón `confirming` existente). `logged` → "Hecho" solo lectura. Hoy marcado.
Navegación ‹ › con `currentIsoWeek`/`shiftIsoWeek`.

## Errores y bordes

- Día ocupado → 409 con mensaje existente, visible en la rejilla.
- `logged`: ni se borra ni se toca desde la rejilla (el DELETE responde 409).
- Semanas pasadas/futuras navegables libremente.
- Semana con plantillas borradas: la JOIN del GET ya filtra (INNER JOIN) →
  celda vacía. Sin caso especial.

## Data model

Sin cambios. (Regla openspec: los cambios de datos llevarían notas de migración
SQLite; aquí no aplica.)
