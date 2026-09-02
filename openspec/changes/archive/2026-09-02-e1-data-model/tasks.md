# Tasks — E1 data model + API

## 1. DB bootstrap (TDD)
- [x] 1.1 RED: test that `lib/db.ts` creates `data/esencial.db` (tmp path) with WAL on first use
- [x] 1.2 GREEN: `lib/db.ts` + `lib/schema.sql` (all tables, idempotent)
- [x] 1.3 RED+GREEN: second open on existing DB is a no-op preserving data

## 2. Recipes API (TDD)
- [x] 2.1 RED: POST `/api/recipes` with ingredients+steps+materials → 201, GET returns them ordered
- [x] 2.2 GREEN: route + Zod validation
- [x] 2.3 RED+GREEN: POST without name → 400 `{error, field}`, nothing written
- [x] 2.4 RED+GREEN: PUT/DELETE `/api/recipes/[id]` (cascade children)

## 3. Exercises API (TDD)
- [x] 3.1 RED+GREEN: POST/GET/PUT/DELETE `/api/exercises` (+tags); GET filter `?tag=` (unknown tag → [] not error)

## 4. Templates API (TDD)
- [x] 4.1 RED+GREEN: CRUD `/api/templates` with ordered exercises + rotation_index; order preserved on PUT

## 5. Meal plan API (TDD)
- [x] 5.1 RED+GREEN: PUT/GET `/api/meal-plan/[week]` slots; slot referencing deleted recipe → empty on read (RESTRICT + manual clear or SET NULL semantics decided in apply if simpler)

## 6. Sessions + logs API (TDD)
- [x] 6.1 RED+GREEN: POST `/api/plan-sessions` (schedule template on date, unique date)
- [x] 6.2 RED+GREEN: POST `/api/workout-logs/[date]` close session (sets+effort+note) → read-only; second close → 409
- [x] 6.3 RED+GREEN: GET last-values per exercise (weight+reps of most recent logged set)

## 7. Day notes API (TDD)
- [x] 7.1 RED+GREEN: PUT/GET `/api/notes/[date]` (replace on re-save)

## 8. Verify & close
- [x] 8.1 Full `npm test` + `npm run build` green
- [x] 8.2 Curl smoke E2E on prod build: recipe → meal-plan slot → schedule → close log (201) → dup 409 → last-values 60×6 → delete recipe → slot reads empty → 400 envelopes verified
- [ ] 8.3 Update project-site tree (E1 done), archive change, joint evaluation

## Known debt (from orchestration review)
- `setLogSchema` field naming is mixed (`templateExerciseId` camelCase vs `set_index`/`weight_kg` snake_case) — functional but inconsistent; normalize in E6 (registro gym) when the UI consumes it.
