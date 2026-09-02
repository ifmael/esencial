# Proposal — E1 data model + API: SQLite schema and BFF routes

## Why

E0 delivered the runnable skeleton. Esencial's features (E2 recetario, E3 plan semanal + compra, E4 plan fuerza, E5 día, E6 registro gym) all consume the same persisted data through one API. E1 defines the single source of truth: SQLite schema (better-sqlite3) + Next API routes as the only access layer, built test-first.

## What Changes

- Add `lib/db.ts`: single better-sqlite3 connection helper; creates `data/esencial.db` on first use; WAL mode.
- Add initial schema (idempotent bootstrap): recipes, recipe_ingredients, exercises, session_templates, session_template_exercises, week_plans (meals), meal_slots, plan_sessions (scheduled workouts), workout_logs, set_logs, day_notes. See `specs/data-model/spec.md` for tables and rules.
- Seed API: empty on first boot (user's data is his own); no fixtures.
- Add BFF API routes under `app/api/*` for full CRUD of the above (JSON in/out, Zod-validated).
- All API routes are the only code touching SQLite (per `openspec/config.yaml` architecture rule).
- Testing: vitest against the real schema in a temp DB (fast, no mocks for DB); RED-GREEN-REFACTOR per route group.

## Scope

- Files: `lib/db.ts`, `lib/schema.sql`, `app/api/**/route.ts`, `lib/api-validation.ts`, tests under `tests/api/`.
- Non-goals: any UI change, auth, deployment, shopping-list aggregation logic (E3), "last session prefill" logic (E6 may extend queries).

## Risks

- Schema churn before E2..E6 land — mitigated: schema ships with its own migration note (`lib/schema.sql` versioned, additive ALTERs only after first release; single-user so reset-and-reseed is acceptable pre-MVP).
- Medium risk on data loss if routes write without validation — mitigated: Zod validation mandatory per route (fail closed).

## Decision

Approve to proceed with `sdd-spec` for E1 (this change).
