# Tasks: Fase 2 Typecheck

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | < 60 (1 product edit, 5 config/script edits, 1 new tsconfig) |
| 400-line budget risk | Low |
| Delivery strategy | direct commits on `ifmael/fase2-typecheck` (no PRs) |

## Phase 1: Scripts + type (t1)

- [ ] 1.1 (RED) Run `pnpm typecheck` at root — confirm failure (no scripts; record web's 8 errors TS2339/TS2353 for the verify report).
- [ ] 1.2 Add `"typecheck": "tsc"` to `api/package.json` and `web/package.json`.
- [ ] 1.3 Bootstrap e2e typecheck: devDeps `typescript@5.9.3` + `@types/node@24` (exact pin), script `"typecheck": "tsc"`, new `e2e/tsconfig.json` (strict, noEmit, bundler, node types).
- [ ] 1.4 Add root aggregator `"typecheck": "pnpm -r typecheck"`.
- [ ] 1.5 Add `summary?: { effort: number; exercises: number; sets: number } | null` to `DaySession` in `web/src/lib/day.ts`; if dia.tsx needs guards, add `session.summary &&` (no `!`).
- [ ] 1.6 (GREEN) `pnpm typecheck` exits 0 checking api, web, e2e.
- [ ] 1.7 Fix stale commands in `openspec/config.yaml` (`"npm test"` → `"pnpm test"`; `"npm run build"` → `"pnpm build"`).
- [ ] 1.8 Commit `chore(typecheck): scripts tsc por workspace, agregador raíz y tipo DaySession completo`.

## Phase 2: Build gate (t2)

- [ ] 2.1 Change web `"build"` to `tsc && vite build`.
- [ ] 2.2 Verify `pnpm build` green with clean code.
- [ ] 2.3 Commit `build(web): bloquea el build con errores de tipos`.

## Phase 3: Verify (t3)

- [ ] 3.1 Run `pnpm typecheck` (3 workspaces), `pnpm test` (api+web), `pnpm build` — all green; record evidence.
- [ ] 3.2 Negative gate check: inject `const _gate: number = "x";` in `web/src/lib/day.ts` → `pnpm build` fails TS2322 → revert → build green.
- [ ] 3.3 Write `verify-report.md` with RED evidence + results; commit `chore(openspec): cierra verify fase2-typecheck`.

## Phase 4: Archive (t4)

- [ ] 4.1 Move change to `openspec/changes/archive/2026-09-06-fase2-typecheck/`.
- [ ] 4.2 Promote delta verbatim to `openspec/specs/typecheck/spec.md`.
- [ ] 4.3 Commit `chore(openspec): archiva change fase2-typecheck y promociona spec typecheck`.
