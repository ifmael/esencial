# Proposal: Fase 2 Typecheck

## Intent

`vite build` transpiles without checking types, so type errors reach production undetected. Add `tsc --noEmit` typechecking per workspace, a root aggregator, and a build gate so type errors block the web build.

## Scope

### In Scope

- `"typecheck": "tsc"` scripts in `api/` and `web/`; `e2e/` gets `typescript` + `@types/node` devDeps, a `tsconfig.json`, and an equivalent `"typecheck": "tsc"` script.
- Root aggregator: `"typecheck": "pnpm -r typecheck"` — fails if any workspace fails.
- Build gate in `web/`: `"build": "tsc && vite build"`.
- Complete the `DaySession` type (`web/src/lib/day.ts`) with the `summary` field the API already returns.

### Out of Scope

- CI workflow (TODO Fase 1 — one phase at a time).
- Lint (TODO Fase 3).
- Any runtime behavior change (types only).

## Capabilities

### New Capabilities

- `typecheck`: per-workspace `tsc --noEmit`, root aggregate script, and a web build gate that fails on type errors.

### Modified Capabilities

None.

## Approach

Option A+ (user-approved): typecheck scripts + `tsc &&` gate in the web build (covers manual deploy, which runs `pnpm build`/`pnpm deploy`). No CI. Single product-code edit: add `summary?: { effort: number; exercises: number; sets: number } | null` to `DaySession` — the API already returns it (`api/src/routes/day.ts`: `{effort, exercises, sets} | null`) and both `web/src/routes/dia.tsx` and the vitest fixtures already consume/provide it. STRICT TDD: RED = `pnpm typecheck` fails (no scripts; 8 known web errors TS2339/TS2353), GREEN = all three workspaces exit 0.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `api/package.json` | Modified | add `typecheck` script |
| `web/package.json` | Modified | add `typecheck` script; build runs `tsc &&` |
| `web/src/lib/day.ts` | Modified | `DaySession.summary?` field |
| `e2e/package.json` | Modified | typescript + @types/node devDeps, `typecheck` script |
| `e2e/tsconfig.json` | New | strict, noEmit, node types |
| `package.json` (root) | Modified | aggregate `typecheck` script |
| `openspec/config.yaml` | Modified | stale npm commands → pnpm |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Latent type errors in e2e once strict tsc runs | Med | Fix at root cause (correct types), never `@ts-ignore`/`any`; stop and report if over line budget |
| Null-narrowing errors in `dia.tsx` from optional `summary` | Low | Guard `session.summary &&` at read points |
| `pnpm -r typecheck` ordering after adding e2e deps | Low | `pnpm install` before retry |

## Rollback Plan

Revert the commits: remove typecheck scripts (api/web/e2e/root), delete `e2e/tsconfig.json`, revert `build` to `vite build`, drop the `summary?` field, restore npm commands in `openspec/config.yaml`. No data or runtime impact — types only.

## Dependencies

- `typescript@5.9.3` (already in api/web devDeps; added to e2e, exact pin).
- `@types/node@24` (e2e only; `tests/setup.ts` imports `node:fs`/`node:path`).

## Success Criteria

- [ ] `pnpm typecheck` from repo root exits 0 and checks api, web and e2e.
- [ ] `pnpm build` runs `tsc` first; an injected type error fails the build (TS2322 negative check).
- [ ] `pnpm test` (api + web vitest) still green.
- [ ] RED evidence recorded: 8 web errors (4× TS2339 in `dia.tsx`, 4× TS2353 in `day-page.test.tsx`).
