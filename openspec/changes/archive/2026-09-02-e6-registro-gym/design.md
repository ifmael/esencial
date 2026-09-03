# Design — E6 registro gym

## D1: Route `/fuerza/:date` under the existing react-router app

The screen is a new SPA route (`web/src/routes/fuerza.tsx` → `FuerzaPage`), date from the path param (`YYYY-MM-DD`), so back-from-exercise-detail and Day-navigation both work with the browser history. E5's Día card links here with the selected date. State is derived from the server, never from the URL beyond `:date`: on mount the page fetches the plan session for the date and branches A (editable) / B (read-only). No new server-side rendering — the Worker serves the SPA and the API is the only data layer (CM1 architecture).

## D2: Compose the screen from already-shipped endpoints; zero new read routes

Reads needed and their existing sources:

- Session for the date: `GET /api/plan-sessions` (list) filtered client-side by `date` — the list is one week of rows; a `GET /api/plan-sessions/:date` would be a new route for zero benefit (ponytail: don't add endpoints the client can't compute).
- Exercise structure (rows, order, target sets/reps): `GET /api/templates/:id` → `exercises[]` with `id` (templateExerciseId), `exerciseId`, `exerciseName`, `position`, `target_sets`, `target_reps_min`, `target_reps_max`.
- Prefill per exercise: `GET /api/exercises/:id/last` → `{exerciseId, last: {weightKg, reps, date} | null}`.
- Already-logged payload (state B): `GET /api/workout-logs/:date`.

Write: `POST /api/workout-logs/:date` body `{effort, note?, sets[]}` → 201 log (200-shape) | 400 `{error, field}` | 404 no session | 409 already logged.

The client generates one set row per exercise per `target_sets` (default 3 when null), indexed `0..n-1` — `set_index` is client-owned ordering, exactly what E1's POST validation expects (rows must reference template exercises of the planned template; anything else → 400 `sets`).

## D3: setLogSchema normalization — clean break, fully camelCase (DEBT DECISION)

**Decision: break cleanly. The API accepts ONLY `{templateExerciseId, setIndex, weightKg, reps, done}` after this change; no dual-name compatibility window.**

Justification:

1. There is exactly one consumer of the snake_case names: code that does not exist yet. `setLogSchema` (`api/src/api-validation.ts:72`) is exercised by `api/tests/sessions-logs.test.ts` and consumed by `workout-logs.ts` POST only. No mobile app, no third-party integration, no other deployed client.
2. Deploy unit is atomic: CM1 ships API + SPA as one Worker artifact (`pnpm build && wrangler deploy`), so server and client can never run at different wire versions. A compatibility window protects against a skew that this architecture cannot produce.
3. Dual-name acceptance ("accept both during transition") is the expensive option paid twice: a `z.preprocess`/union parser now AND a removal later, with a spec that must describe two contracts. Clean break deletes that whole class.
4. Coherence: every other input schema is already camelCase on the wire (`recipeSchema`, `mealSlotSchema`, `planSessionSchema`, and `templateExerciseId` itself). The snake_case outliers (`set_index`, `weight_kg`, plus `target_sets`/`setup_cues` in template/exercise *inputs*) violate the project's own convention — the DB stays snake_case, the wire does not.

**Definitive sets API (input, POST body `sets[]`):**

| field | type | required | notes |
|---|---|---|---|
| `templateExerciseId` | int > 0 | yes | must belong to the planned template, else 400 `sets` |
| `setIndex` | int ≥ 0 | yes | client-assigned order within the exercise |
| `weightKg` | number ≥ 0 | optional/nullable | |
| `reps` | int ≥ 0 | optional/nullable | |
| `done` | boolean | optional (default `false`) | |

Output (GET/POST responses) already emits `setIndex`/`weightKg` camelCase aliases (`workout-logs.ts:25`) and keeps `done` as a real boolean — response shape is unchanged. The response `note`/`effort`/`template` envelope is untouched.

Deliberate boundary: `exerciseSchema.target_sets`/`setup_cues` and `templateSchema.rotation_index` are *other* schemas' debt; this change touches only `setLogSchema` (and its bind sites in `workout-logs.ts`). Expanding scope to all schemas would churn E2/E4-owned surfaces without need — each epic normalizes what it consumes.

**Migration notes (SQLite):** none. No `schema.sql` change, no D1 migration — `set_logs.set_index` / `weight_kg` columns stay as-is; only the JSON wire names bound at `workout-logs.ts:94` change. Data in local/remote D1 is untouched. Rollback = redeploy previous version; old names validate again.

## D4: Effort and note are session-level, mapped straight onto `workout_logs`

Five large dots (min 44px touch targets, `role="radiogroup"`, labels "Muy fácil"(1) … "Máximo"(5)); the DB `CHECK (effort BETWEEN 1 AND 5)` is enforced client-side too: "Cerrar sesión" is disabled until effort is picked, and the API's 400 (`effort must be 1-5`) is surfaced as a banner if somehow hit. Note is a single free-text `textarea` (nullable — omitted from the payload when blank, never sent as `""` whitespace-only… trimmed to `null` when empty).

## D5: Draft state is in-memory only

Edits (weight, reps, done) live in a single `useState` draft keyed by `templateExerciseId`. No localStorage, no server drafts — logging happens standing in a gym next to the rack; the flow is one screen-load → fill → close, and the failure mode (browser crash mid-set) re-prefills from `last` which is one tap of recovery. Server-side draft persistence is explicitly deferred until real daily use complains (H2 validation).

## D6: State B (logged) is the same layout, fed by GET, zero mutation affordances

If `plan_sessions.status === 'logged'` (or POST answered 409), the page refetches `GET /api/workout-logs/:date` and renders: weights/reps as text (`60×8` / `—` when null), checked-or-unchecked static checkboxes, filled effort dots, note as text, "Registrado" badge in the header. The 409 response body (the `{error: "This day is already logged and read-only"}` envelope) triggers the same reload-to-B path, so a double-submit from two tabs cannot diverge the UI.

## D7: Client fetch layer — one typed helper, reused by later epics

`web/src/lib/api.ts` (new, shared): `apiGet<T>(path)` / `apiSend<T>(path, method, body)` that parse JSON, throw `ApiError {error, field, status}` on non-2xx using the existing `{error, field?}` envelope, and a `fieldErrors` helper for inline field messaging. Unit-tested with mocked `fetch`. `useWorkoutDay(date)` hook orchestrates reads + POST with `pending`/`error` flags so components stay dumb (mirrors the E2 `useRecipes` pattern from the e2 spec).

## D8: TDD shape

API-side: rename is RED first — existing `sessions-logs.test.ts` POST payloads with `set_index`/`weight_kg` must start failing 400 (`sets.setIndex` required / unknown key stripped → Zod default `.object` strips, so the *absence* of `setIndex` is what fails; that is exactly the desired contract), then GREEN by rewriting fixtures to camelCase and adding a test asserting snake_case is rejected with a field error. UI-side: vitest + @testing-library (jsdom, mocked fetch) per behavior: draft math, prefill helper text, dot selection, disabled-until-effort, POST payload shape, 409→state B, read-only rendering. E2E smoke via `wrangler dev` + browser at verification.
