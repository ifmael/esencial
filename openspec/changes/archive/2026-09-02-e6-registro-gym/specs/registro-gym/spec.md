# Spec — E6 registro gym

## ADDED Requirements

### Requirement: Workout day screen route

The SPA MUST expose the workout logging screen at `/fuerza/{date}` (date `YYYY-MM-DD`). The header MUST show a back control, the formatted Spanish date, and the name of the session template assigned to that date. The screen MUST be usable at 360px width with touch targets of at least 44px and Spanish labels.

#### Scenarios
- Given a session "Empuje A" is scheduled for 2026-09-02, When `/fuerza/2026-09-02` loads, Then the header shows the date and "Empuje A".
- Given no session is scheduled for the date, When the route loads, Then an empty state says no session is assigned and offers a way back (no crash, no blank page).
- Given the date param is malformed (e.g. `/fuerza/hola`), When the route loads, Then the screen shows the invalid-date state without any API write attempt.

### Requirement: Editable set list (state A)

For a planned (not yet logged) session, the screen MUST list the template exercises in `position` order, each row showing the exercise name and one checkbox per target set (missing `target_sets` defaults to 3). Tapping an exercise name MUST open the exercise detail route for its `exerciseId`. Expanding an exercise MUST show per-set rows with a weight stepper (kg) and a reps stepper, both editable, each with an accessible label.

#### Scenarios
- Given template "Empuje A" has "Press banca" (`target_sets` 3) and "Remo con barra" (`target_sets` null), When state A renders, Then two exercise rows appear in template order with 3 and 3 checkboxes respectively.
- Given "Press banca" is expanded, When the user increments the weight stepper, Then the displayed value changes and no network request is made.
- Given an exercise row's name is tapped, When navigation occurs, Then the app route for that exercise's detail is opened.

### Requirement: Last-session prefill

On load of state A, the screen MUST fetch `GET /api/exercises/{id}/last` for each exercise in the session and use the result as the stepper starting values. When a last value exists, the expanded exercise MUST show the helper "última: {weightKg}×{reps}"; when the response's `last` is null, steppers start empty and no helper is shown.

#### Scenarios
- Given the last logged set for "Press banca" was 57.5 kg × 8, When the day screen loads, Then "última: 57.5×8" is visible for that exercise and its set rows are prefilled with 57.5 and 8.
- Given an exercise has never been logged, When the day screen loads, Then its steppers start at empty/zero and no "última" helper is rendered.
- Given the `last` endpoint fails (network), When the day screen loads, Then a non-blocking error state is shown and the user can still log the session manually.

### Requirement: Session-level effort and note

State A MUST provide a perceived-effort control with exactly five options (values 1–5, labels "Muy fácil" to "Máximo") behaving as a single-select radiogroup, and a free-text note field (optional, multi-line). The "Cerrar sesión" primary button MUST be disabled while no effort value is selected.

#### Scenarios
- Given no effort dot is selected, When the user views the screen, Then "Cerrar sesión" is disabled.
- Given the user selects dot 4, When "Cerrar sesión" becomes enabled and is pressed, Then the POST body carries `effort: 4`.
- Given the note field is left blank (or whitespace), When the session is closed, Then the POST body omits `note` or sends it as null (never an empty string the API must special-case).

### Requirement: Closing the session (POST)

Pressing "Cerrar sesión" MUST send `POST /api/workout-logs/{date}` with `{effort, note?, sets}` where each set item is `{templateExerciseId, setIndex, weightKg, reps, done}`. On 201 the screen MUST switch to state B showing the server's persisted values. The submit control MUST be disabled while the request is in flight (no duplicate POST). On a 400 `{error, field}` response the error message MUST be shown (with field context when provided) and the draft preserved.

#### Scenarios
- Given two exercises × 3 sets filled and effort 3 selected, When the user closes the session, Then one POST is sent whose `sets` array has 6 camelCase items and the response 201 flips the screen to read-only with the "Registrado" badge.
- Given the button is pressed twice rapidly, When the first request is still in flight, Then exactly one POST reaches the API.
- Given the API returns 400 with field `sets.setIndex`, When the response arrives, Then the visible error names the problem and all entered values remain editable.

### Requirement: Logged day is read-only (state B)

When `plan_sessions.status` for the date is `logged`, the screen MUST render from `GET /api/workout-logs/{date}`: weights/reps as static text (`—` when null), done-set checkboxes non-interactive, effort dots filled up to the logged value, note as text, and a "Registrado" badge in the header. State B MUST NOT expose steppers, editable note fields, or the "Cerrar sesión" button.

#### Scenarios
- Given 2026-09-02 was logged with effort 2, When `/fuerza/2026-09-02` loads, Then the header shows "Registrado", no input control is editable, and dot 2 of 5 is the highest filled.
- Given two tabs both open state A for the same date, When tab 2 closes the session after tab 1 already logged it (API answers 409), Then tab 2 reloads into state B and shows the persisted data — no error-only dead end.

### Requirement: Normalized set-log wire contract (debt)

`setLogSchema` MUST accept fully camelCase set items — `templateExerciseId`, `setIndex`, `weightKg`, `reps`, `done` — consistent with the rest of the API's input schemas. The snake_case names `set_index` and `weight_kg` MUST NOT be accepted on the wire (clean break, no compatibility window): a payload using them MUST fail validation with a 400 `{error, field}` envelope referencing the missing camelCase key. Validation semantics are unchanged: `templateExerciseId` positive integer, `setIndex` integer ≥ 0, `weightKg` number ≥ 0 optional/nullable, `reps` integer ≥ 0 optional/nullable, `done` boolean defaulting false. The SQLite schema and stored data MUST NOT change; response shapes already use camelCase aliases and remain as-is.

#### Scenarios
- Given a POST body with `sets: [{templateExerciseId: 1, setIndex: 0, weightKg: 60, reps: 8, done: true}]`, When validated, Then the row persists to `set_logs` with `set_index`/`weight_kg` bound from the camelCase fields and the GET response echoes camelCase.
- Given a POST body using `set_index`/`weight_kg` (old names), When submitted, Then the API responds 400 and no `workout_logs` row is created.
- Given a set item whose `templateExerciseId` is not in the planned template, When submitted, Then the API responds 400 with field `sets` (existing E1 rule preserved).

## MODIFIED Requirements

None — the E1 data-model spec's behavior (409 double-close, 404 unscheduled date, atomic batch) is preserved; only the input wire names change, which is stated as an ADDED contract above.
