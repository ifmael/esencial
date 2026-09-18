# e2e-flujos-criticos Specification

## Purpose

Playwright coverage of Esencial's four critical journeys (auth + Día, recipes, strength, edge paths) against the real stack (Hono Worker + D1 + React SPA), served by its own `wrangler dev` on `http://127.0.0.1:8788`, with a database in `e2e/.state` derived from `api/migrations/`, in Brave.

## ADDED Requirements

### Requirement: AUTH-DIA — Login and Día day view

Wrong passwords MUST show a visible error; dev password `hola` MUST enter. `/` MUST render RECETA, FUERZA, NOTAS cards with empty states when empty.

#### Scenario: Wrong password

- GIVEN unauthenticated user on /login
- WHEN wrong password submitted
- THEN visible error shown and user stays on /login

#### Scenario: Correct login

- GIVEN unauthenticated user on /login
- WHEN password `hola` submitted
- THEN app enters protected destination and session survives reload

#### Scenario: Hoy empty states

- GIVEN authenticated user with no recipes, sessions or notes
- WHEN opening `/`
- THEN RECETA, FUERZA and NOTAS cards show empty-state content

### Requirement: RECIPES — Recipe loop end to end

MUST support creating a recipe, listing/opening it in `/recetario`, adding it to the week plan in `/plan-recetas`, and managing the shopping sheet (mark done, add item).

#### Scenario: Recipe listed

- GIVEN authenticated user
- WHEN creating recipe with name and ingredients
- THEN listed in /recetario and detail shows name and ingredients

#### Scenario: Plan and shopping sheet

- GIVEN created recipe
- WHEN adding to current week in /plan-recetas
- THEN appears in week plan and shopping sheet opens with its ingredients

#### Scenario: Done and manual item

- GIVEN open shopping sheet with recipe item
- WHEN marking done and adding manual item
- THEN item shows done, manual item listed, both persist after reload

### Requirement: STRENGTH — Template, schedule and session loop

MUST support creating an exercise template in `/plan-fuerza`, scheduling it for a date (shown on FUERZA card at `/`), registering the session from `/sesion/:date` with logged summary in Hoy, and MUST reject a second session for the same date.

#### Scenario: Template created

- GIVEN authenticated user on /plan-fuerza
- WHEN creating template with name and two exercises
- THEN saved and shown with its exercises

#### Scenario: Programar card

- GIVEN created template
- WHEN scheduling with chosen date
- THEN FUERZA card at `/` shows template name and numbered exercises in order

#### Scenario: Session logged

- GIVEN scheduled session for a date
- WHEN registering from /sesion/:date with effort and sets
- THEN session registered and FUERZA card in Hoy shows logged summary

#### Scenario: Duplicate 409

- GIVEN session already scheduled for a date
- WHEN registering second session for that date
- THEN "Ya hay una sesión ese día" visible and no duplicate created

### Requirement: EDGE — Week navigation, autosave, errors, redirect

MUST support week navigation in `/plan-recetas`, debounced autosave of Hoy notes (flushed on blur/leave), visible rendering of API 400/409 `{error, field}` errors, and auth redirect of deep links to `/login?next=...` with return to destination.

#### Scenario: Week nav

- GIVEN authenticated user on /plan-recetas
- WHEN clicking next or previous week
- THEN shown week changes and recipes reload

#### Scenario: Notes autosave

- GIVEN NOTAS card on `/`
- WHEN typing and leaving field before debounce
- THEN note saved and visible after reload

#### Scenario: Envelope error

- GIVEN API mutation failing validation or conflicting
- WHEN API returns 400/409 `{error, field}`
- THEN visible UI message with error text shown

#### Scenario: Deep link

- GIVEN unauthenticated user opening /plan-recetas
- WHEN guard redirects to /login?next=/plan-recetas and login succeeds
- THEN user lands on /plan-recetas

### Requirement: INFRA — Isolated test infrastructure

`pnpm e2e` MUST run against a persistence directory owned by the e2e suite (`e2e/.state`) and MUST NOT read or write the development state directory (`.wrangler/state`). The suite MUST serve itself from a port reserved for e2e (8788) with `reuseExistingServer: false`, so a running `pnpm dev` is never adopted. Before serving, the suite MUST delete `e2e/.state` and apply every migration in `api/migrations/` in filename order against the empty directory, so the database of a run is derived from the migrations alone; adding a migration MUST NOT require any change under `e2e/`. The suite MUST run with `workers: 1`, because a run has one server and one database. Playwright MUST run on Brave (`/usr/bin/brave-browser`, `--no-sandbox`) when present; the setup project MUST API-login with `hola` and save `storageState`; wrong-login MUST occur at most once per run (rate limit 5/15 min/IP).

#### Scenario: Setup auth

- GIVEN running e2e server on 8788
- WHEN setup project logs in via POST /api/auth/login with `hola`
- THEN storageState saved and authenticated projects reuse it

#### Scenario: Development database untouched

- GIVEN the development database holds arbitrary state
- WHEN `pnpm e2e` finishes
- THEN every D1 table row count and the PHOTOS object count in `.wrangler/state` are unchanged

#### Scenario: A running dev server is not adopted

- GIVEN `pnpm dev` is serving on 8787
- WHEN `pnpm e2e` runs
- THEN the suite serves itself on 8788 and the development database is still unchanged

#### Scenario: A new migration needs no e2e work

- GIVEN a new `api/migrations/0010_*.sql`
- WHEN `pnpm e2e` runs
- THEN the e2e database includes its schema and seed rows without any edit under `e2e/`

#### Scenario: Two consecutive runs

- GIVEN two consecutive `pnpm e2e` runs
- WHEN both complete
- THEN both are green without deleting data between them

#### Scenario: One file at a time

- GIVEN the e2e database of a run
- WHEN the suite executes
- THEN only one test file runs at a time (`workers: 1`), so no test observes a table another file is writing

### Requirement: DATA — Test data baseline

Tests MUST obtain catalog exercises by looking them up through `GET /api/exercises` and selecting the seeded row by name. Tests MUST NOT create an exercise whose name exists in the seed: `exercises.name` is UNIQUE, so the insert fails. Tests MAY create via API only the entities absent from the seed — recipes, session templates, and cardio exercises (every seeded exercise is `kind = 'strength'`) — and within one run the names they create for a given entity MUST be unique across test files. Tests MUST use dates relative to today with no run-encoded randomness, and every test that writes a session MUST own a date no other test writes (a fixed base offset plus one ISO week per test). A test MAY delete the planned session on its own exclusive date so that a Playwright retry can run again; it MUST NOT delete rows on a date it does not own.

#### Scenario: Seeded exercise is looked up, not created

- GIVEN "Press banca" is in the seeded catalog
- WHEN a strength test needs that exercise
- THEN it resolves the id via `GET /api/exercises` and issues no `POST /api/exercises` with that name

#### Scenario: Cardio has no seed

- GIVEN a cardio exercise is needed
- WHEN the test seeds it
- THEN it POSTs a `kind: "running"` exercise tagged `cardio`

#### Scenario: Created entities keep unique names within a run

- GIVEN the suite creates recipes and templates
- WHEN it runs twice in a row
- THEN each run is green and no UNIQUE constraint is violated within a run

#### Scenario: Each session-writing test owns its date

- GIVEN a fresh e2e database
- WHEN a test schedules a session
- THEN it uses a date it owns and deletes no session belonging to another test
