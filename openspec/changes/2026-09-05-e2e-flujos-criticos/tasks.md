# Tasks: E2E Flujos Críticos (Playwright)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~500–600 (8 created, 3 modified) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single review unit (review-only worktree branch) |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

Chained PRs recommended: No — delivery is NOT via PRs; one review-only worktree branch is the review unit.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | E2E package boots | single review unit | `pnpm e2e --list`, then smoke `pnpm e2e` | `pnpm dev` + Brave on :8787 | delete `e2e/`, revert workspace/root/.gitignore |
| 2 | Journeys 1–3 RED→GREEN | single review unit | `pnpm --filter @esencial/e2e test auth-dia recipes strength` | webServer real stack | revert specs + product fixes |
| 3 | Journey 4 + full suite green | single review unit | `pnpm e2e` | full 4-journey run | revert edge spec + fixes |

## Phase 1: E2E Infrastructure (t1)

- [ ] 1.1 Create `e2e/package.json`: name `@esencial/e2e`, devDependency `@playwright/test`, script `"test": "playwright test"`.
- [ ] 1.2 Create `e2e/playwright.config.ts`: baseURL `http://127.0.0.1:8787`; webServer `pnpm dev` at repo root (`/api/health`, `reuseExistingServer: true`); Brave `executablePath: "/usr/bin/brave-browser"`, `--no-sandbox`; `retries: 2`; `setup` API-login `hola` → `e2e/.auth/state.json`; authenticated projects `dependOn: ["setup"]`.
- [ ] 1.3 Create `e2e/tests/helpers.ts`: `login`, `apiRequest`, unique-name generator; no shared fixtures.
- [ ] 1.4 Add `e2e` to `packages` in `pnpm-workspace.yaml`; add `"e2e": "pnpm --filter @esencial/e2e test"` to root `package.json`.
- [ ] 1.5 Add `e2e/.auth/`, `test-results/`, `playwright-report/` to `.gitignore`.
- [ ] 1.6 Smoke: `pnpm install`, `pnpm e2e` — setup logs in, storageState saved; commit `chore(e2e)`.

## Phase 2: Journeys 1–3 RED→GREEN (t2)

- [ ] 2.1 (RED) Write `e2e/tests/auth-dia.spec.ts` — wrong password, `hola` login + reload, `/` empty states; run, confirm failing.
- [ ] 2.2 (GREEN) Fix product bugs in `web/`/`api/` until auth-dia green; conventional commit.
- [ ] 2.3 (RED) Write `e2e/tests/recipes.spec.ts` — create → `/recetario` → week plan → shopping sheet (done, manual item); run, confirm failing.
- [ ] 2.4 (GREEN) Fix product bugs in `web/`/`api/` until recipes green; conventional commit.
- [ ] 2.5 (RED) Write `e2e/tests/strength.spec.ts` — template → schedule → FUERZA card → session log → duplicate 409; run, confirm failing.
- [ ] 2.6 (GREEN) Fix product bugs in `web/`/`api/` until strength green; conventional commit.

## Phase 3: Edge + Full Suite (t3)

- [ ] 3.1 (RED→GREEN) Write `e2e/tests/edge.spec.ts` — week nav, notes autosave, envelope 400/409, deep-link `/login?next=` return; fix bugs until green.
- [ ] 3.2 Run full `pnpm e2e`: all 4 journeys green; wrong-login at most once per run.
- [ ] 3.3 Flake cleanup: explicit waits + stable selectors, `retries: 2`, no shared data.
- [ ] 3.4 Regression: `pnpm test` (unit), `pnpm build` green.

## Phase 4: Orchestrator Verify (t4)

- [ ] 4.1 Write `openspec/changes/2026-09-05-e2e-flujos-criticos/verify-report.md`; no archive; worktree stays review-only.
