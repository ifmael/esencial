# Proposal: E2E Flujos Críticos (Playwright)

## Intent

No automated E2E coverage exists; the four critical journeys (auth + Día,
recipes loop, strength loop, edge paths) are only manually tested and fragile
before UI changes. Add a Playwright suite against the real stack (Hono Worker +
D1 + React SPA) in a worktree.

## Scope

### In Scope

- New `e2e/` workspace package: `@playwright/test`, `playwright.config.ts`
  (`webServer` runs `pnpm dev` at repo root; baseURL `http://127.0.0.1:8787`;
  Brave `/usr/bin/brave-browser`, `--no-sandbox`).
- Setup project + dependent authenticated projects; `storageState` via API login
  (dev password `hola`).
- Four spec files, one per journey; each test self-contained (own data via
  UI/API, D1 seeded with 91 exercises, relative dates).
- Worktree left for review, NOT merged to main; change NOT archived.

### Out of Scope

- CI wiring, visual regression, cross-browser matrix, load testing, fixing
  bugs found (report only), merging/archiving.

## Capabilities

### New Capabilities

- `e2e-flujos-criticos`: Playwright E2E suite covering auth+Día, recipes loop,
  strength loop, edge paths (week nav, autosave, error envelopes, auth
  redirect), runnable via `pnpm --filter e2e test`.

### Modified Capabilities

None.

## Approach

- Add `e2e/` package to the workspace; `webServer` = `pnpm dev` at repo root
  (wrangler dev, port 8787), `reuseExistingServer: true`.
- `setup` logs in via `fetch` to `/api/auth/login` (password `hola`), saves
  `storageState`; authenticated projects `dependOn: setup`; others cover wrong
  login and redirect.
- Stable selectors, explicit waits, `retries: 2`; wrong-login fails once per
  run (rate limit 5/15 min/IP).
- Run: `pnpm --filter e2e test` from the worktree.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `e2e/` | New | `package.json`, `playwright.config.ts`, tests (4 journeys + helpers) |
| `pnpm-workspace.yaml` | Modified | Add `e2e` to `packages` |
| `package.json` (root) | Modified | Optional `test:e2e` script |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Browser flake | Med | `--no-sandbox`, retries 2, explicit waits |
| Rate limit breaks wrong-login rerun | Low | One failure per run; rerun after window |
| Port 8787 conflict | Low | `reuseExistingServer: true` |
| D1 seed drift | Low | Assert catalog presence, not exact count |

## Rollback Plan

Remove `e2e/` from `pnpm-workspace.yaml`, delete `e2e/`, revert root
`package.json`. Worktree never merged, so `main` is untouched; discard if
needed.

## Dependencies

- `@playwright/test` (new dev dependency in `e2e/`).
- Brave at `/usr/bin/brave-browser`.
- D1 local seeded (migrations 0001–0008, 91 exercises).
- `pnpm dev` working at repo root (predev generates `.dev.vars`).

## Success Criteria

- [ ] `pnpm --filter e2e test` runs green for all 4 journeys.
- [ ] Each journey asserts its named acceptance (login/Hoy, recipe loop,
      strength 409, autosave + redirect).
- [ ] Existing api/web test suites still pass.
