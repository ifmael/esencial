# Design: Fase 2 Typecheck

## Technical Approach

Option A+ (user decision): per-workspace `tsc --noEmit` scripts, a root aggregator, and `tsc &&` gating the web build. No CI. One product-code edit (`DaySession.summary`). STRICT TDD: RED is the recorded failing run (no scripts + 8 known web errors TS2339/TS2353), GREEN is all three workspaces exiting 0.

## Architecture Decisions

### Decision: D1 — Option A+ (build gate, no CI)

**Choice**: `"build": "tsc && vite build"` in web plus typecheck scripts; no CI workflow.
**Alternatives**: CI-only typecheck (TODO Fase 1, out of scope — "una fase a la vez"); IDE-only checking (not enforced).
**Rationale**: manual deploy runs `pnpm build`/`pnpm deploy` (root `deploy` = `pnpm build && wrangler deploy`), so the gate covers the real deployment path today; CI wiring lands in Fase 1 and can call `pnpm typecheck` afterwards.

### Decision: D2 — e2e included in typecheck

**Choice**: e2e gets `typescript@5.9.3` (exact pin, repo style) + `@types/node@24` devDeps and its own strict `tsconfig.json` (`moduleResolution: bundler`, `types: ["node"]`, include config+tests).
**Alternatives**: exclude e2e (the TODO lists it explicitly; `tests/setup.ts` imports `node:fs`/`node:path` — untyped today).
**Rationale**: TODO Fase 2 names e2e; bootstrap cost is two devDeps and one small tsconfig.

### Decision: D3 — `summary` optional in DaySession

**Choice**: `summary?: { effort: number; exercises: number; sets: number } | null`.
**Alternatives**: required field (breaks existing fixtures that omit it); duplicated narrower type.
**Rationale**: the API returns the summary only for logged sessions; planned sessions omit it. Optional mirrors the wire contract and keeps existing fixtures valid; readers already handle absence.

### Decision: D4 — openspec/config.yaml commands → pnpm

**Choice**: replace `"npm test"` → `"pnpm test"` and `"npm run build"` → `"pnpm build"` in `apply.test_command`, `verify.test_command`, `verify.build_command`.
**Alternatives**: leave stale (config references npm in a pnpm monorepo — verify commands would run the wrong package manager).
**Rationale**: config drives SDD verify; it must run the real commands. In-scope as tooling hygiene for this change.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `web/src/lib/day.ts` | Modify | `DaySession.summary?` field (only product-code edit) |
| `api/package.json` | Modify | `"typecheck": "tsc"` |
| `web/package.json` | Modify | `"typecheck": "tsc"`; `"build": "tsc && vite build"` |
| `e2e/package.json` | Modify | typescript + @types/node devDeps; `"typecheck": "tsc"` |
| `e2e/tsconfig.json` | Create | strict, noEmit, bundler resolution, node types |
| `package.json` (root) | Modify | `"typecheck": "pnpm -r typecheck"` |
| `openspec/config.yaml` | Modify | npm → pnpm commands |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| typecheck | 3 workspaces exit 0 | `pnpm typecheck` at root |
| gate | injected TS2322 fails `pnpm build` | temporary line in `web/src/lib/day.ts`, revert after |
| regression | api + web vitest | `pnpm test` |

## Migration / Rollout

No migration. Rollout is immediate on merge; no runtime behavior changes.

## Open Questions

- [ ] None blocking.
