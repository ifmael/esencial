# e2e-flujos-criticos Specification

## Purpose

Playwright coverage of Esencial's four critical journeys (auth + Día, recipes, strength, edge paths) against the real stack (Hono Worker + D1 + React SPA), via `pnpm dev` on `http://127.0.0.1:8787`, in Brave.

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

### Requirement: INFRA — Self-contained test infrastructure

MUST run via `pnpm e2e` or `pnpm --filter @esencial/e2e test` with Playwright on Brave (`/usr/bin/brave-browser`, `--no-sandbox`); setup project MUST API-login with `hola` and save `storageState`. Each test MUST be self-contained (own data, relative dates); wrong-login MUST occur at most once per run (rate limit 5/15 min/IP).

#### Scenario: Setup auth

- GIVEN running dev server
- WHEN setup project logs in via POST /api/auth/login with `hola`
- THEN storageState saved and authenticated projects reuse it
