# Proposal — E6 registro gym: mobile-first workout logging

## Why

E1 shipped the write path (`POST /api/workout-logs/:date`, last-values endpoint, 409 read-only rule) but no screen has ever used it. E6 is the "H2 — registro gym cómodo" success hypothesis: from the day's scheduled session, the user fills weight × reps per set (prefilled with last session), checks each set done, picks perceived effort 1–5, adds an optional note, and closes the session. It also pays the debt E1 left on record: `setLogSchema` mixes camelCase and snake_case wire names (`templateExerciseId` vs `set_index`, `weight_kg`) and must be normalized before more clients depend on it.

## What Changes

- New SPA route `/fuerza/:date` (mobile-first, wireframe `pantalla-3`), reached from the FUERZA card on Día (E5):
  - Header: back button, date, session name (e.g. "Empuje A"); "Registrado" badge in state B.
  - Exercise rows from the planned template (`GET /api/templates/:id`): name (links to `/ejercicio/:id`, owned by E4), one checkbox per set.
  - Expanded exercise: per-set rows with kg/reps steppers, helper "última: 57.5×8" from `GET /api/exercises/:id/last`.
  - Perceived effort as 5 large dots ("Muy fácil" … "Máximo", values 1–5) + free-text note.
  - Primary button "Cerrar sesión" → `POST /api/workout-logs/:date` with all set rows.
- State A (planned) is editable; state B (logged) renders the same layout read-only from `GET /api/workout-logs/:date` — no steppers, filled dots, values as text.
- API normalization (debt): `setLogSchema` input becomes fully camelCase — `{templateExerciseId, setIndex, weightKg, reps, done}` — clean break, no dual-name compatibility window (rationale in design D3). No `schema.sql` change; DB columns stay snake_case, SELECT aliases already emit camelCase responses.
- Shared client plumbing this epic introduces and later epics reuse: `web/src/lib/api.ts` typed fetch helper (throws on the `{error, field?}` envelope) and a `useWorkoutDay` hook.

## Scope

- Files: `api/src/api-validation.ts`, `api/src/routes/workout-logs.ts` (bind names only), `api/tests/sessions-logs.test.ts`, `web/src/lib/api.ts`, `web/src/routes/fuerza/**`, `web/src/components/workout/**`, `web/tests/**`.
- Non-goals: editing/undoing a logged session, server-side draft persistence, volume/history charts, exercise detail screen and template editor (E4), Día home integration beyond the link contract (E5), auth (E7), new read endpoints.

## Risks

- Low-medium: the wire-name break is safe here (the SPA that consumes it ships in this same change; no third-party clients exist) but any hand-written curl/script the user still has will 400 after deploy. Mitigated: single Worker artifact deploys API + SPA together, so no version-skew window.
- Draft lives in memory only — closing the tab mid-workout loses it. Accepted for MVP (documented in design D5); revisit only if it hurts in daily use.
- Rollback: revert commit; no data migration to undo.

## Decision

Approve to proceed with implementation of this change (specs + tasks below).
