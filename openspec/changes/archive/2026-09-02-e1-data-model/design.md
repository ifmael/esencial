# Design — E1 data model + API

## Decisions

### D1: SQLite via better-sqlite3, synchronous, one connection
Single-user, low concurrency → synchronous calls are simplest and fastest. `lib/db.ts` exports one connection (module singleton), opens `data/esencial.db` (path from `ESSENTIAL_DB_PATH` env, default `data/esencial.db` — same relative path in dev and in the LXC bind mount), `pragma journal_mode = WAL`, `foreign_keys = ON`.

### D2: Schema as versioned SQL file, applied idempotently
`lib/schema.sql` with `CREATE TABLE IF NOT EXISTS` — idempotent bootstrap (no migration framework while pre-MVP; single user, reset acceptable before first release; ALTER-only migrations added when first real data exists). Version comment at top of file.

### D3: Tables (8 + 3 junctions, plain and boring)

- `recipes(id, name UNIQUE, description, servings)`
- `recipe_ingredients(id, recipe_id FK→recipes ON DELETE CASCADE, position, food, quantity REAL, unit)`
- `recipe_steps(id, recipe_id FK CASCADE, position, text)`
- `recipe_materials(id, recipe_id FK CASCADE, name)` — utensil chips
- `exercises(id, name UNIQUE, description, setup_cues, technique_url)`
- `exercise_tags(exercise_id FK CASCADE, tag)` — multi-tag, PK (exercise_id, tag)
- `session_templates(id, name UNIQUE, rotation_index)` — rotation A→B→C by rotation_index
- `template_exercises(id, template_id FK CASCADE, exercise_id FK RESTRICT, position, target_sets, target_reps_min, target_reps_max)`
- `week_plans(id, iso_week UNIQUE)` + `meal_slots(id, week_plan_id FK CASCADE, day 0-6, meal TEXT CHECK(desayuno|almuerzo|cena), recipe_id FK RESTRICT, UNIQUE(day, meal, week_plan_id))`
- `plan_sessions(id, date UNIQUE, template_id FK RESTRICT, status CHECK(planned|logged))`
- `workout_logs(id, plan_session_id FK UNIQUE, date, effort 1-5, note)` + `set_logs(id, workout_log_id FK CASCADE, template_exercise_id FK, set_index, weight_kg REAL, reps, done)`
- `day_notes(date UNIQUE PRIMARY KEY, text)` — one editable note per day

Rationale: FK CASCADE for owned children (ingredients die with recipe), RESTRICT for cross-domain references (meal slot → recipe) so deletion is explicit, UNIQUE constraints enforcing business rules at the DB (one log per session, one note per day, one slot per meal/day).

### D4: API routes as BFF (the only SQLite consumers)
REST-ish route handlers under `app/api/`: `recipes`, `recipes/[id]`, `exercises`, `templates`, `templates/[id]`, `meal-plan/[week]`, `plan-sessions`, `workout-logs/[date]`, `notes/[date]`. Zod parse on every mutation → 400 fail closed. Read-only routes serialize with plain `JSON.stringify`. No auth in E1 (Tailscale LAN boundary, E7 revisits).

### D5: Testing — real DB in temp file
Vitest suites under `tests/api/` spin a fresh DB (`ESSENTIAL_DB_PATH` → tmp file) per suite: fast, exercises real SQL, no mocks. TDD: each route group red→green.

## Migration notes
First release of schema; bootstrap-only. Future additive changes: new `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` guarded by version check in `lib/db.ts`.
