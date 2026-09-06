# typecheck Specification

## Purpose

Catch TypeScript errors before production: every workspace typechecks with `tsc --noEmit`, the root aggregates the check, and the web build refuses to produce artifacts on type errors.

## ADDED Requirements

### Requirement: SCRIPTS — Per-workspace typecheck scripts

Each workspace MUST typecheck without emitting: `api` and `web` MUST expose `"typecheck": "tsc"`; `e2e` MUST have a `tsconfig.json` (strict, `noEmit`) covering `playwright.config.ts` and `tests`, plus an equivalent `"typecheck": "tsc"` script.

#### Scenario: Workspace typecheck runs clean

- GIVEN dependencies installed in a workspace
- WHEN running `pnpm --filter <workspace> typecheck`
- THEN `tsc --noEmit` exits 0 with no emitted files

#### Scenario: Type error fails workspace typecheck

- GIVEN a source file in the workspace contains a type error
- WHEN running the workspace `typecheck` script
- THEN the script exits non-zero and prints the TS diagnostics

### Requirement: AGGREGATE — Root typecheck script

The root package MUST expose `"typecheck": "pnpm -r typecheck"` so one command checks every workspace; it MUST fail (non-zero exit) if any workspace typecheck fails.

#### Scenario: One workspace failing fails the aggregate

- GIVEN web has a type error and api/e2e are clean
- WHEN running `pnpm typecheck` at the repo root
- THEN the command exits non-zero and reports the failing workspace

#### Scenario: All workspaces clean

- GIVEN all workspaces typecheck clean
- WHEN running `pnpm typecheck` at the repo root
- THEN the command exits 0 after checking api, web and e2e

### Requirement: BUILD_GATE — Type errors block the web build

The `web` `build` script MUST be `tsc && vite build`; a type error MUST prevent the build from producing output (non-zero exit).

#### Scenario: Injected type error blocks build

- GIVEN a type error injected in `web/src/lib/day.ts` (TS2322)
- WHEN running `pnpm build`
- THEN the build fails with the TS diagnostic and no dist output is produced

#### Scenario: Clean code builds

- GIVEN the workspace typechecks clean
- WHEN running `pnpm build`
- THEN `tsc` passes and `vite build` emits the SPA normally

### Requirement: DAY_SESSION_TYPE — DaySession declares the API summary

`DaySession` (`web/src/lib/day.ts`) MUST declare `summary?: { effort: number; exercises: number; sets: number } | null`, matching what the API returns for logged sessions; the field MUST be optional so fixtures that omit it stay valid.

#### Scenario: dia.tsx reads summary type-safely

- GIVEN a logged session returned by the API
- WHEN `web/src/routes/dia.tsx` renders the session summary
- THEN it compiles without TS2339 on `summary`

#### Scenario: Fixtures may omit summary

- GIVEN a test fixture of `DaySession` without `summary`
- WHEN the tests typecheck
- THEN compilation succeeds (TS2353 gone)
