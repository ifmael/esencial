# Spec — CM1 migración a Cloudflare (React+Vite + Hono + D1)

## ADDED Requirements

### Requirement: SPA served by the Worker
The Worker MUST serve the built SPA (Vite output) as static assets for all non-`/api` routes, and the SPA MUST handle client routing (`/`, `/plan-recetas`, `/plan-fuerza`) with the E0 shell (sidebar desktop / bottom tabs mobile) and Día placeholder (navigable date header, 3 empty sections).

#### Scenarios
- Given the deployed Worker, When the user opens `/`, Then the Día placeholder renders with working date navigation.
- Given the user directly opens `/plan-recetas`, Then the SPA loads and renders the (empty) route — deep links work.

### Requirement: API parity
The Worker MUST expose the same 13 API routes with the same contracts as E1 (paths, methods, status codes, error envelopes `{ error, field? }`), validated with the same Zod schemas.

#### Scenarios
- Given a POST `/api/recipes` without name, Then the Worker responds 400 `{ error, field: "name" }`.
- Given a recipe, meal-plan slot, scheduled session, closed workout log (sets/effort/note), day note — all E1 journey flows — When replayed against the Worker, Then every response matches the E1 contract (status + shape).

### Requirement: D1 data layer
The Worker MUST use the D1 binding with the E1 schema applied; all SQL from `lib/repo.ts`/routes ported to async D1 calls; no better-sqlite3 anywhere. Schema application MUST be scripted (`wrangler d1 execute` with `schema.sql` minus unsupported pragmas) and idempotent.

#### Scenarios
- Given a fresh D1 database, When the migration script runs, Then all 14 tables exist and the API works end-to-end.
- Given the script runs twice, Then the second run is a no-op (IF NOT EXISTS).

### Requirement: Local development parity
`wrangler dev` MUST serve API + SPA together locally with a local D1; `npm run dev` (Vite) MUST proxy `/api` to it for hot reload.

#### Scenarios
- Given a clean checkout, When `npm install && npm run dev` runs, Then the SPA works with live data from local D1 without any Cloudflare login.

### Requirement: Test parity
The API test suite MUST cover the E1 behavioral spec against real local D1 (vitest-pool-workers), including: 400 fail-closed envelopes, 409 double-log, cascade recipe delete leaving meal slots empty, last-values query, read-only logged day. UI tests MUST cover the shell, date header, and loading/empty/error states.

#### Scenarios
- Given the full test suite runs locally, Then it passes without network access and exercises real D1 (not mocks).

### Requirement: Deploy checklist
The repo MUST include a documented one-command deploy (`wrangler deploy`) plus D1 creation/migration steps, verified against the user's Cloudflare account (workers.dev URL) with the E1 journey replayed.

#### Scenarios
- Given the user's Cloudflare account is authenticated, When following the deploy checklist, Then the app is reachable at the workers.dev URL with data persisting across restarts.
