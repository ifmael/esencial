# Tasks — E1 data model + API

## 1. DB bootstrap (TDD)
- [ ] 1.1 RED: test that `lib/db.ts` creates `data/esencial.db` (tmp path) with WAL on first use
- [ ] 1.2 GREEN: `lib/db.ts` + `lib/schema.sql` (all tables, idempotent)
- [ ] 1.3 RED+GREEN: second open on existing DB is a no-op preserving data

## 2. Recipes API (TDD)
- [ ] 2.1 RED: POST `/api/recipes` with ingredients+steps+materials → 201, GET returns them ordered
- [ ] 2.2 GREEN: route + Zod validation
- [ ] 2.3 RED+GREEN: POST without name → 400 `{error, field}`, nothing written
- [ ] 2.4 RED+GREEN: PUT/DELETE `/api/recipes/[id]` (cascade children)

## 3. Exercises API (TDD)
- [ ] 3.1 RED+GREEN: POST/GET/PUT/DELETE `/api/exercises` (+tags); GET filter `?tag=` (unknown tag → [] not error)

## 4. Templates API (TDD)
- [ ] 4.1 RED+GREEN: CRUD `/api/templates` with ordered exercises + rotation_index; order preserved on PUT

## 5. Meal plan API (TDD)
- [ ] 5.1 RED+GREEN: PUT/GET `/api/meal-plan/[week]` slots; slot referencing deleted recipe → empty on read (RESTRICT + manual clear or SET NULL semantics decided in apply if simpler)

## 6. Sessions + logs API (TDD)
- [ ] 6.1 RED+GREEN: POST `/api/plan-sessions` (schedule template on date, unique date)
- [ ] 6.2 RED+GREEN: POST `/api/workout-logs/[date]` close session (sets+effort+note) → read-only; second close → 409
- [ ] 6.3 RED+GREEN: GET last-values per exercise (weight+reps of most recent logged set)

## 7. Day notes API (TDD)
- [ ] 7.1 RED+GREEN: PUT/GET `/api/notes/[date]` (replace on re-save)

## 8. Verify & close
- [ ] 8.1 Full `npm test` + `npm run build` green
- [ ] 8.2 Curl smoke: create recipe → plan → slot; schedule session → close → log read-only
- [ ] 8.3 Update project-site tree (E1 done), archive change, joint evaluation
