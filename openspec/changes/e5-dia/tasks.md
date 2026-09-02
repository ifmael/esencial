# Tasks — E5 día

> Strict TDD: every functional task is RED (failing test first) → GREEN (minimal
> implementation) in the same task. Commands: `pnpm --filter api test`,
> `pnpm --filter web test` (no full-project suites until phase 5).

## 1. Date helpers (API, TDD)
- [ ] 1.1 RED+GREEN: `api/src/dates.ts` — `isoWeekOf(date)` and `dayIndexOf(date)` as pure functions on `YYYY-MM-DD` strings, no clock access; pin edges: 2026-09-01→`2026-W36`/1, 2026-09-06→index 6, 2026-12-31→`2026-W53`, 2027-01-01→`2026-W53`/4
- [ ] 1.2 RED+GREEN: reject non-`YYYY-MM-DD` input (return null / throw typed) so the route can 400 with `{ error, field: "date" }`

## 2. `GET /api/day/:date` (API, TDD)
- [ ] 2.1 RED+GREEN: happy path — seed via public endpoints (PUT `/api/meal-plan/2026-W36` day 1 slots, POST `/api/plan-sessions`, PUT `/api/notes/2026-09-02`); assert full envelope: `date, isoWeek, dayIndex, meals` ordered desayuno→almuerzo→cena with `recipeId`/`recipeName`, `session` `{id, templateId, templateName, status, summary: null}`, `note.text`
- [ ] 2.2 RED+GREEN: empty day — no week plan, no session, no note → 200 with `meals: []`, `session: null`, `note: { text: "" }`
- [ ] 2.3 RED+GREEN: deleted recipe → slot present with `recipeId: null, recipeName: null`, still 200
- [ ] 2.4 RED+GREEN: logged session summary — after POST `/api/workout-logs/:date`, `session.status === "logged"` and `summary` = `{ effort, exercises, sets }` from COUNTs on `set_logs`
- [ ] 2.5 RED+GREEN: `2026-9-2` / garbage date → 400 `{ error, field: "date" }`; unknown non-ISO-week edge dates map correctly through 1.1
- [ ] 2.6 MOUNT: register `day` router in `api/src/index.ts` under `/api`; existing contract tests (13 routes + health) still green

## 3. Day screen: header + data hook (Web, TDD)
- [ ] 3.1 RED+GREEN: `web/src/lib/day.ts` — `useDay(date)` with `{ data, loading, error, reload }`; one fetch per date; responses for superseded dates discarded (out-of-order resolution test)
- [ ] 3.2 RED+GREEN: header — keeps `DayHeader`/`addDays`/`formatDateEs` exports green (`web/tests/day-header.test.ts`); adds "Hoy" prefix on local today, "Hoy" jump button, native `<input type="date">` jump; quick links "Plan recetas" / "Plan fuerza"
- [ ] 3.3 RED+GREEN: loading skeletons and single error card with "Reintentar" (no stale sections, no blank page)

## 4. Day screen: sections (Web, TDD)
- [ ] 4.1 RECETA — cards per meal (label + name, E-order), tap → `/plan-recetas/<id>`; empty/all-null → "Aún no has planificado comidas para este día" + CTA `/plan-recetas`
- [ ] 4.2 FUERZA — three states: null → empty + CTA `/plan-fuerza`; planned → amber badge + "Registrar sesión" → `/sesion/<date>`; logged → green summary (exercises/sets/effort) → same route; placeholder route `/sesion/:date` registered in `app.tsx`
- [ ] 4.3 NOTAS — textarea seeded from `note.text`; debounced (~800 ms, fake timers) `PUT /api/notes/<date>`; indicator states guardando/guardado/error-with-retry; date switch flushes pending save against the LEFT date; empty-on-load never fires PUT

## 5. Verify & close
- [ ] 5.1 `pnpm --filter api test` + `pnpm --filter web test` green
- [ ] 5.2 Browser smoke (`pnpm dev`): today loads in one `/api/day` call → prev/next/today/picker → seed a plan + session + note → three states of FUERZA visible → autosave survives a mid-debounce date switch
- [ ] 5.3 Visual pass vs `pantalla-1-dia.txt` (mobile + desktop columns, DESIGN.md tokens)
- [ ] 5.4 Update project-site tree (E5), archive change, joint evaluation
