# Design — E5 día

## Decisions

### D1: Server-side aggregation (`GET /api/day/:date`), not a client fetch-chain
The day needs three correlated reads (meal slots for the date, session for the date, note
for the date). Chaining them client-side would (a) cost 3+ round trips, (b) duplicate the
date→ISO-week conversion in every consumer, and (c) leave the calendar math untested until
the UI ships. One Hono route aggregates with 3 cheap queries against the existing tables
(`week_plans`/`meal_slots`, `plan_sessions`/`session_templates`/`workout_logs`/`set_logs`,
`day_notes`) and reuses the established serializers' field style (`recipeId`, `recipeName`,
camelCase). The full set-by-set log detail stays with `GET /api/workout-logs/:date` (E6's
screen uses it); `/api/day` only carries a minimal green-summary triple so the card renders
in one fetch (coordination with E4: no endpoint overlap, no shape duplication).

### D2: Calendar mapping is ISO-8601, computed from the literal date string — server never reads the clock
`meal_slots` is keyed by `(iso_week 'YYYY-Www', day 0–6)`. Mapping rules:

- `dayIndex = (UTCgetDay(date) + 6) % 7` → **Monday = 0 … Sunday = 6** (E1 spec scenario
  "day: monday" + wireframe "lunes" first).
- `isoWeek` = standard ISO-8601 week number (Thursday rule; week belongs to the ISO year
  containing the date's Thursday; weeks 01–53).

Both live in one pure module `api/src/dates.ts` (`isoWeekOf(date: string): string`,
`dayIndexOf(date: string): number`), operating on the `YYYY-MM-DD` string parsed as UTC.
The Worker never calls `new Date()`/`now()`: "today" is a client decision (local timezone),
which keeps the endpoint deterministic and testable and avoids TZ drift on the edge runtime.
Edges pinned by tests: 2026-09-01 → `2026-W36`, index 1; 2027-01-01 → `2026-W53`, index 4;
2026-12-31 → `2026-W53`, index 3.

### D3: Response envelope
```jsonc
// GET /api/day/2026-09-02 → 200
{
  "date": "2026-09-02",
  "isoWeek": "2026-W36",
  "dayIndex": 1,
  "meals": [                     // only this day's slot rows, ordered desayuno→almuerzo→cena
    { "meal": "desayuno", "recipeId": 7, "recipeName": "Tortilla" },
    { "meal": "cena", "recipeId": null, "recipeName": null }   // slot cleared by recipe delete → renders as empty
  ],
  "session": {                   // null when nothing scheduled for the date
    "id": 3, "templateId": 2, "templateName": "Empuje A", "status": "planned",
    "summary": null              // logged → { effort: 3, exercises: 5, sets: 20 }; planned → null
  },
  "note": { "text": "" }         // mirrors GET /api/notes/:date ("", no row = "")
}
```
Missing week plan / missing slots / missing session are **empty data, not errors**. Only a
malformed `:date` fails: `400 { "error": "date must be YYYY-MM-DD", "field": "date" }`,
identical to `/api/notes/:date`. DB faults flow through the existing `guard`/`dbFailure`.
The client shows an empty section with a CTA whenever `meals` has no entry with a
`recipeName` (D5), so "no plan" and "plan deleted" converge to one honest empty state.

### D4: SPA keeps the one-fetch model; state stays local to the page
`web/src/routes/dia.tsx` (rewrite of the placeholder) keeps the exported `DayHeader`,
`addDays`, `formatDateEs` (existing tests in `web/tests/day-header.test.ts` must survive).
A `useDay(date)` hook in `web/src/lib/day.ts` fetches `/api/day/<date>` and exposes
`{ data, loading, error, reload }`. The selected date is page state; prev/next arrows reuse
the existing handlers; "Hoy" jumps back to local today; the calendar button is a visually
hidden native `<input type="date">` whose `onChange` sets the date (ponytail: no picker
dependency). Section links under the header ("Plan recetas", "Plan fuerza") match the
wireframe; the Shell's sidebar/tabs are untouched.

### D5: The three sections and their empty states (the acceptance open-question, resolved)
- **RECETA**: one text card per slot with a recipe (name + meal label); tap → `/plan-recetas/<id>`
  (E2 detail route). No photo thumbnail — `recipes` has no photo column yet (schema.sql is
  the source of truth). `meals` empty or all-null → card "Aún no has planificado comidas
  para este día" + link "Ir al plan semanal" (`/plan-recetas`).
- **FUERZA**: `session === null` → "Sin sesión asignada" + link "Ver el plan de fuerza"
  (`/plan-fuerza`). `status === "planned"` → amber Pending badge (DESIGN.md token) +
  primary button "Registrar sesión" → `/sesion/<date>`. `status === "logged"` → green
  summary card ("Sesión completada · 5 ejercicios · 20 series · esfuerzo 3/5") → tapping
  the card goes to the same route (E6 renders it read-only).
- **NOTAS DEL DÍA**: textarea seeded from `note.text`; edits save via
  `PUT /api/notes/<date>` debounced ~800 ms with an inline indicator ("Guardando…" →
  "Guardado"); navigating to another date flushes a pending save before switching (no lost
  keystrokes). Saves for date A must never land on date B (test pins this).
`/sesion/:date` is registered in `web/src/app.tsx` as a minimal placeholder ("Pantalla de
trabajo — llega con E6") purely so the CTA is never a dead link; E6 replaces its element.

### D6: Error/loading UX per DESIGN.md
Loading: skeleton cards (surface blocks, `#F5F5F4`). API unreachable: one error card with
"Reintentar" calling `reload()` — never a blank page (parity with E2 spec). Autosave
failure: indicator turns red ("No guardado — reintentar"), text preserved.

### D7: TDD plan (strict RED→GREEN)
API: contract tests in `api/tests/day.test.ts` using the existing `freshDb` + `fetch`-style
helpers against the real Hono app (vitest-pool-workers), seeded through the public
endpoints (PUT `/api/meal-plan/:week`, POST `/api/plan-sessions`, PUT `/api/notes/:date`,
POST `/api/workout-logs/:date`) so the aggregation is tested against real rows, not mocks.
Pure date helpers get their own unit test with the ISO edges from D2. Web: `useDay` with
mocked `fetch`, section rendering, empty states, badge/summary branches, debounce + flush
behavior via `vi.useFakeTimers`.

## Migration notes
No schema changes: `api/schema.sql` is untouched (no new columns/tables; the query set is a
read join over `week_plans`, `meal_slots`, `plan_sessions`, `session_templates`,
`workout_logs`, `set_logs`, `day_notes`). Rollback = revert commits; endpoint is additive.
