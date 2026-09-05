# Design: E2E Flujos Críticos (Playwright)

## Technical Approach

Add an `@esencial/e2e` Playwright workspace package driving the real stack: `webServer` runs `pnpm dev` at repo root (predev repairs `.dev.vars`, builds SPA, wrangler serves API+SPA on `http://127.0.0.1:8787`). `setup` logs in once via `POST /api/auth/login` (password `hola`) and saves `storageState` to `e2e/.auth/state.json` (gitignored); authenticated projects reuse it. Each test creates its own data via UI/API with relative dates — no shared fixtures. STRICT TDD (AGENTS.md): specs are written first and run against the real worker (`pnpm e2e`); an e2e failure is a product bug fixed in `api/` or `web/` (RED→GREEN).

## Architecture Decisions

### Decision: `e2e/` workspace package

**Choice**: `e2e/` at repo root added to `packages` in `pnpm-workspace.yaml`; `e2e/package.json`: name `@esencial/e2e`, devDependency `@playwright/test`, script `"test": "playwright test"`; root script `"e2e": "pnpm --filter @esencial/e2e test"` (existing `test` script untouched).
**Alternatives**: Playwright inside `api/`/`web/` (app dep pollution); outside the workspace (no monorepo install).
**Rationale**: matches the `web`/`api` layout; E2E deps isolated; one lockfile.

### Decision: webServer = `pnpm dev` at repo root

**Choice**: `webServer.command: "pnpm dev"`, `cwd` = repo root (one level above `e2e/`), `url: "http://127.0.0.1:8787/api/health"`, `timeout: 120000`, `reuseExistingServer: true`.
**Alternatives**: bare `wrangler dev` (skips predev `.dev.vars` repair and SPA build); per-project servers (port 8787 conflicts).
**Rationale**: identical to the human dev command; `reuseExistingServer` tolerates a running server.

### Decision: Brave via executablePath

**Choice**: `use.executablePath: "/usr/bin/brave-browser"`, `launchOptions.args: ["--no-sandbox"]`.
**Alternatives**: bundled Chromium download (~150 MB); system Chrome.
**Rationale**: Brave installed and known-good; `--no-sandbox` required in this environment.

### Decision: Setup project API auth

**Choice**: `setup` logs in via `fetch` to `/api/auth/login` `{password:"hola"}` and saves storageState; authenticated projects `dependOn: ["setup"]`; wrong-login and redirect specs run unauthenticated.
**Alternatives**: UI login per test (slow, duplicated); per-test API login (defeats storageState).
**Rationale**: one login per run; UI-login path still asserted by AUTH-DIA.

### Decision: Self-contained tests, minimal helpers, no fixtures

**Choice**: `e2e/tests/helpers.ts` holds only shared request builders (`login`, `apiRequest`) and a unique-name generator. No DB fixtures, no shared test data.
**Alternatives**: seeded baseline rows (collides with local D1 state; seed count drifts).
**Rationale**: the worker runs against whatever local D1 state exists; tests must not depend on shared rows. Assert catalog presence, not exact counts.

### Decision: Error-envelope assertions

**Choice**: assert the visible UI message for `{error, field}` responses (400/409) — e.g. "Ya hay una sesión ese día" — the envelope from `api/src/http.ts` `fail()` (`field` optional).
**Alternatives**: assert raw `{error, field}` JSON in UI specs (tests internals, brittle).
**Rationale**: the spec requires *visible* rendering; error text is the user-facing contract.

### Decision: Wrong-login at most once per suite

**Choice**: exactly one wrong-login test per run.
**Alternatives**: parametrized wrong-password matrix.
**Rationale**: rate limit is 5 failures/15 min/IP (`api/src/rate-limit.ts`); a matrix exhausts it mid-suite. Rerun after the 15-min window.

### Decision: gitignore + commit series

**Choice**: add `e2e/.auth/`, `test-results/`, `playwright-report/` to root `.gitignore`. Commits (conventional, NO AI attribution): `chore(openspec)` planning → `chore(e2e)` infra → `test(e2e)` journeys → `test(e2e)` edge+verify → `chore(openspec)` verify-report.
**Alternatives**: commit storageState (leaks auth, goes stale).
**Rationale**: secrets never in git; artifacts stay local; series matches worker ownership.

### Decision: Parallel workers

**Choice**: 3 omp workers in the SAME worktree — t1 backend infra (config, webServer, setup), t2 frontend journeys 1–3, t3 QA edge paths (journey 4) + full suite + flake cleanup; t4 verify by orchestrator.
**Alternatives**: 4+ workers.
**Rationale**: t1–t3 touch disjoint files; full suite needs all specs first, so verification is a separate after-phase. Worktree left for review; no merge to main; change NOT archived.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `e2e/package.json` | Create | `@esencial/e2e`, `@playwright/test`, `"test"` script |
| `e2e/playwright.config.ts` | Create | baseURL, webServer, Brave, setup + project matrix |
| `e2e/tests/helpers.ts` | Create | `login`, `apiRequest`, unique-name generator; no fixtures |
| `e2e/tests/auth-dia.spec.ts` | Create | Journey 1: wrong password, login + reload, `/` empty states |
| `e2e/tests/recipes.spec.ts` | Create | Journey 2: create → `/recetario` → week plan → shopping sheet (done + manual item) |
| `e2e/tests/strength.spec.ts` | Create | Journey 3: template → schedule → FUERZA card → session log → duplicate 409 |
| `e2e/tests/edge.spec.ts` | Create | Journey 4: week nav, notes autosave, envelope 400/409, deep-link redirect |
| `pnpm-workspace.yaml` | Modify | add `e2e` to `packages` |
| `package.json` (root) | Modify | add `"e2e"` script |
| `.gitignore` | Modify | ignore `e2e/.auth/`, `test-results/`, `playwright-report/` |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | 4 journeys, 14 scenarios | Playwright on real worker + Brave; RED→GREEN; `retries: 2`; relative dates |
| Regression | api/web unit suites | must still pass: `pnpm test` |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary changed.

## Migration / Rollout

No migration required.

## Open Questions

- [ ] None blocking.
