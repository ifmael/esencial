# Proposal — E4 plan fuerza: rotation templates + exercise catalog UI

## Why

E1 shipped the strength data layer on D1: `exercises`, `exercise_tags`, `session_templates`, `template_exercises` and the `/api/exercises` + `/api/templates` routes (13-route contract, `{error, field?}` envelope). None of it has a UI: the `/plan-fuerza` route is a placeholder stub. E4 turns that into the user's training plan — the A→B→C rotation of session templates (Empuje / Tirón / Piernas) browsed, edited, and fed from a proper exercise catalog — per wireframes `pantalla-7-plan-fuerza.txt` (plan) and `pantalla-6-ejercicio.txt` (exercise detail). E5 (Día) and E6 (gym logging) consume templates and exercises; without E4 they have nothing real to point at.

## What Changes

- **Route `/plan-fuerza`** (replaces the E0 stub): header "Plan fuerza", rotation chips (A→B→C, from `GET /api/templates` order), template cards as expandable lists (exercise name + target series per row; tapping an exercise opens its detail), per-template edit mode (rename, rotation, add/remove/reorder entries, edit target sets/reps), duplicate template, "+ Nueva plantilla" — per `pantalla-7`.
- **Exercise picker with search** inside template edit: client-side filter (name + tags) over the catalog; tapping adds the exercise at the end of the entry list.
- **Route `/ejercicios`** (catalog list): cards with name + tag chips, search, "+ Nuevo ejercicio"; the entry point for managing the catalog.
- **Route `/ejercicios/:id`** (detail, per `pantalla-6`): name, description, muscle-group tag chips, setup cues, primary button "Ver técnica" (opens `techniqueUrl` in a new tab), primary action "Añadir a plantilla" (template picker → appends via `PUT /api/templates/:id`), pencil → editor, delete with confirmation.
- **Exercise editor** (create + edit): name (required), description, setup cues, technique URL (optional), tags (≥1) — direct mapping of `exerciseSchema`.
- **No server changes**: everything rides the existing E1/CM1 API. Duplicate names, unknown refs, and 404s surface through the existing `{error, field?}` envelope.

## Scope

- Files: `web/src/routes/plan-fuerza.tsx` (rewrite), `web/src/routes/ejercicios.tsx`, `web/src/routes/ejercicio-detalle.tsx`, `web/src/components/strength/**`, `web/src/lib/{templates,exercises,template-draft}.ts`, tests under `web/tests/`.
- Non-goals: scheduling templates onto dates (E5 Día), set logging UI and last-values defaults (E6 — reuses `/api/exercises/:id/last`), exercise photos/illustrations (no schema column; wireframe art renders as placeholder), server-side search, auth (E7).

## Risks

- Low: pure client feature over an existing, tested API; zero schema or route changes. Rollback = revert the commit (the `/plan-fuerza` stub returns).
- `PUT /api/templates/:id` replaces all ordered entries in one batch: a lost-update race (two tabs editing) overwrites silently — mitigated: single-user LAN/personal app, editor reloads the template before saving and the batch is atomic server-side. Accepted.
- Wireframe asks for drag-to-reorder; drag + jsdom tests are brittle — mitigated: arrow buttons ship as the reorder affordance (accessible, testable), drag is an open decision (see design D3).

## Decision

Approve to proceed with the E4 spec (this change). Implementation is delegated to build agents after user validation of `spec-lectura-es.md`.
