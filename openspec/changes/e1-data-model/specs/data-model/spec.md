# Spec — E1 data model + API

## ADDED Requirements

### Requirement: Database bootstrap

The app MUST expose a single SQLite connection helper (`lib/db.ts`) that creates `data/esencial.db` with WAL mode and applies the schema idempotently on first use. Only code under `app/api/**` and this helper MAY import the driver.

#### Scenarios

- Given a fresh checkout with empty `data/`, When any API route is hit, Then `data/esencial.db` exists with all tables from the schema created.
- Given the DB already exists, When the app restarts, Then existing data is preserved and schema application is a no-op.

### Requirement: Recipe domain

The system MUST store recipes with: name (unique), description, servings, per-serving ingredients (food name, quantity, unit), numbered steps, and optional material utensils (chips).

#### Scenarios

- Given a recipe with 3 ingredients and 4 steps, When GET `/api/recipes/{id}`, Then the response includes ingredients ordered as entered and steps numbered 1..4.
- Given POST `/api/recipes` without a name, When validated, Then the API responds 400 with a field error, and nothing is written.

### Requirement: Exercise catalog

The system MUST store exercises with: name (unique), muscle-group tags (one or more), description, setup cues, and optional technique URL.

#### Scenarios

- Given an exercise "Press banca" with tags [pecho, tríceps], When GET `/api/exercises?tag=pecho`, Then it is returned; a query for an unknown tag returns an empty list, not an error.

### Requirement: Session templates (strength plan)

The system MUST store named session templates (e.g. "A — Empuje") with an ordered list of exercise entries, each with target sets and a target rep range, and a user-defined rotation order (A→B→C).

#### Scenarios

- Given template "A — Empuje" with 4 exercises, When GET `/api/templates`, Then exercises come back in their defined order with sets/reps targets.
- Given the user reorders exercises, When PUT is saved, Then subsequent GETs preserve the new order.

### Requirement: Weekly meal plan

The system MUST store, per ISO week, up to 3 meal slots per day (desayuno/almuerzo/cena), each slot referencing a recipe.

#### Scenarios

- Given week 2026-W36, When PUT `/api/meal-plan/2026-W36` with a slot {day: monday, meal: cena, recipeId: 7}, Then GET returns that slot and the recipe name.
- Given a slot references a deleted recipe, When the plan is read, Then the slot renders as empty (no dangling reference errors).

### Requirement: Scheduled sessions and workout logs

The system MUST schedule a session template on a date, and when closed ("Cerrar sesión"), persist one workout log with per-set entries (weight kg, reps, done flag), perceived effort 1–5, and a free-text note. A logged day MUST become read-only.

#### Scenarios

- Given "Empuje A" scheduled on 2026-09-03, When POST `/api/workout-logs` closes it with 12 sets (weight/reps/done each) and effort 3, Then GET `/api/workout-logs/2026-09-03` returns the log read-only with all sets.
- Given a day already logged, When POST attempts to log again for the same date, Then the API responds 409 and the first log is unchanged.
- Given a logged set of 57.5 kg × 8 on the same exercise, When a future session for that exercise starts, Then the API can return that pair as "last values" (query supported; UI use is E6).

### Requirement: Day notes

The system MUST store free-text notes/reflections per date (one editable note per day).

#### Scenarios

- Given a note saved for 2026-09-02, When GET `/api/notes/2026-09-02`, Then its text is returned; saving again replaces the text.

### Requirement: API contract

All API routes MUST: accept/return JSON, validate input with Zod schemas (fail closed, 400 on invalid), map DB errors to 500 with a generic message, and use RFC-style error envelopes `{ error: string, field?: string }`.

#### Scenarios

- Given a POST with malformed JSON body, When the route validates it, Then it responds 400 `{ error, field }` and writes nothing.
- Given an unexpected DB failure, When it occurs, Then the route responds 500 `{ error }` without leaking SQL internals.
