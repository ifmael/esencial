# Proposal — CM1 migración: React+Vite SPA + Hono Workers + D1 en Cloudflare

## Why

The user set the destination platform: Cloudflare Workers (always-on, no home server dependency) and rejected Next.js as the API layer. The current stack (Next.js + better-sqlite3) would need adapters and a different database at deploy time anyway. Deciding now — before E2–E6 write more feature code — makes every future epic target the real platform. E1's data design (SQLite schema, Zod validation, route contracts) is platform-neutral and ports; its driver layer does not.

## What Changes

- **Replace** the Next.js app with two clean packages in the same repo:
  - `web/` — React 19 + Vite + Tailwind 4 SPA (imports DESIGN.md tokens; port of the E0 shell + Día placeholder, now with react-router for `/`, `/plan-recetas`, `/plan-fuerza`).
  - `api/` — Hono app targeting Cloudflare Workers: same 13 route contracts, Zod validation (reuse `api-validation.ts`), data layer rewritten to the D1 binding (same SQL, async `.prepare().bind().all()/run()`).
- **Single Worker deploy**: Worker serves the API under `/api/*` and the built SPA static assets (Workers Static Assets) — one `wrangler deploy`, no CORS.
- **Local dev**: `wrangler dev` serves both API (D1 local SQLite) and the Vite build; Vite dev server proxies `/api` for hot reload.
- **Tests**: vitest stays; API tests run against a real local D1 (`@cloudflare/vitest-pool-workers`), UI tests with testing-library (port of applicable cases; E1's 60 tests are the behavioral spec).
- **Archive** the Next.js implementation: `app/` moves to `legacy/next-app/` (kept until CM1 is verified, then deleted in the same change).

## Scope

- Files: `web/**` (new), `api/**` (new), root `package.json` workspaces, `wrangler.toml` (D1 binding, assets config), move `app/` → `legacy/next-app/`.
- Non-goals: auth (E7), photo upload storage (decided at E2 evaluation; R2 likely), features E2+ (unchanged specs, new stack), custom domain (workers.dev subdomain for now).

## Risks

- Cloudflare account access for the trial deploy — mitigated: local `wrangler dev` + D1 local is fully functional without login; deploy is a separate checklist item the user can run.
- D1 SQL dialect differences (few): `PRAGMA` statements dropped (D1 manages WAL itself), `COLLATE NOCASE` supported, no `RETURNING` changes needed (E1 doesn't use it). Migration script applies `schema.sql` via `wrangler d1 execute`.
- Vitest-pool-workers version churn — mitigated: pin exact versions; fall back to miniflare REST if pool breaks.

## Decision

Approve to proceed with `sdd-spec` for CM1 (this change). E1 is superseded by this change (its behavior is preserved, not its driver).

## Validation

Spec approved by the user (2026-09-02, "Vale" on spec-lectura-es.md). Proceeding to delegated implementation with specialized build agents.
