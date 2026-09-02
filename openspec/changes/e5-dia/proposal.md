# Proposal — E5 día: home screen (day view) + GET /api/day/[date]

## Why

The home route `/` is currently an E0 placeholder: a navigable date header over three
static empty cards. The day screen is the app's front door (wireframe `pantalla-1-dia.txt`)
and the only surface that stitches the three domains together: meals for that date
(`meal_slots` via `/api/meal-plan`), the scheduled strength session (`plan_sessions` via
`/api/plan-sessions`), and the day note (`day_notes` via `/api/notes`). Loading it today
would cost the SPA three correlated fetches plus date→ISO-week math in the client. One
read endpoint (`GET /api/day/:date`) returns the whole day in a single round trip and
keeps the calendar math server-side, where it is testable once.

## What Changes

- **New API route `GET /api/day/:date`** (Hono, mounted under `/api`): aggregates, in one
  JSON envelope, the planned meals for that date (breakfast/lunch/dinner slots joined with
  recipe names), the scheduled session with its `planned`/`logged` status (plus a summary —
  exercises, sets, effort — when logged), and the day note text. Invalid date → the same
  `400 { error, field }` envelope used by `/api/notes/:date`.
- **Home `/` becomes the real DÍA screen** (React, replaces the placeholder body of
  `web/src/routes/dia.tsx`):
  - Date header with the existing prev/next arrows, plus a "Hoy" jump and a native
    `<input type="date">` picker (no picker library).
  - Section RECETA: compact card per planned meal (meal label + recipe name), tapping
    navigates to the E2 recipe detail route. Empty state with a CTA link to `/plan-recetas`.
  - Section FUERZA: session card with status badge — amber "Pendiente" + primary button
    "Registrar sesión" (navigates to the E4 workout screen for that date) or green summary
    (exercises, sets, effort) when logged. No session → empty state with a CTA link to
    `/plan-fuerza`.
  - Section NOTAS DEL DÍA: textarea bound to the day note, autosave via
    `PUT /api/notes/:date` (debounced) with a save indicator.
  - Loading, error-with-retry, and empty states per DESIGN.md.
- **Client data hook** `useDay(date)` wrapping the single endpoint; the note editor owns
  its own dirty/save state.

## Scope

- Files: `api/src/routes/day.ts`, mount in `api/src/index.ts`, contract tests
  `api/tests/day.test.ts`; `web/src/routes/dia.tsx` (rewrite), `web/src/lib/day.ts`
  (hook + fetch types), web tests under `web/tests/`.
- Non-goals: the workout logging screen itself (E4), the week plan editors (E3 meals /
  E7 strength scheduling), recipe photos/thumbnails (no storage column yet — cards are
  text-only until a photo change lands), shopping list, auth, offline caching.

## Risks

- Low: additive read endpoint over an existing, tested schema; the SPA work is one screen
  over three already-tested write APIs. Rollback = revert the two commits (API + web).
- The date→ISO-week/day-index conversion is the one place this can silently be wrong (an
  off-by-one shifts every day's meals). Mitigated: pure function with unit tests pinned to
  known ISO dates (2026-09-01 = Tuesday, W36) before the route exists (RED→GREEN).
- Cross-epic dependency: "Registrar sesión" links to an E4 route. Mitigated: the link is
  inert-safe (routes are SPA deep links; E4 lands its own screen); this spec only fixes
  the navigation intent, not the destination's internals.

## Decision

Approve to proceed with `sdd-spec` for E5 (this change).
