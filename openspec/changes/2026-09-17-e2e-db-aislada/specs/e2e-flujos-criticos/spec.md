# e2e-flujos-criticos — delta (change 2026-09-17-e2e-db-aislada)

## MODIFIED Requirements

### Requirement: INFRA — Self-contained test infrastructure

`pnpm e2e` MUST run against a persistence directory owned by the e2e suite
(`e2e/.state`) and MUST NOT read or write the development state directory
(`.wrangler/state`). The suite MUST serve itself from a port reserved for e2e
(8788) with `reuseExistingServer: false`, so a running `pnpm dev` is never
adopted. Before serving, the suite MUST delete `e2e/.state` and apply every
migration in `api/migrations/` in filename order against the empty directory, so
the database of a run is derived from the migrations alone; adding a migration
MUST NOT require any change under `e2e/`. The suite MUST run with
`workers: 1`. Playwright MUST run on Brave (`/usr/bin/brave-browser`,
`--no-sandbox`) when present; the setup project MUST API-login with `hola` and
save `storageState`; wrong-login MUST occur at most once per run (rate limit
5/15 min/IP).

#### Scenarios

- GIVEN the development database holds arbitrary state, WHEN `pnpm e2e`
  finishes, THEN the row count of every D1 table in `.wrangler/state` and the
  object count of the local PHOTOS bucket in `.wrangler/state` are unchanged.
- GIVEN `pnpm dev` is serving on 8787, WHEN `pnpm e2e` runs, THEN the suite
  serves itself on 8788 and the development database is still unchanged.
- GIVEN a new `api/migrations/0010_*.sql`, WHEN `pnpm e2e` runs, THEN the e2e
  database includes its schema and seed rows without any edit under `e2e/`.
- GIVEN two consecutive `pnpm e2e` runs, WHEN both complete, THEN both are green
  without deleting data between them.
- GIVEN the e2e database of a run, WHEN the suite executes, THEN only one test
  file runs at a time (`workers: 1`), so no test observes a table another file
  is writing concurrently.

## ADDED Requirements

### Requirement: DATA — Test data baseline

Tests MUST obtain catalog exercises by looking them up through
`GET /api/exercises` and selecting the seeded row by name. Tests MUST NOT create
an exercise whose name exists in the seed: `exercises.name` is UNIQUE, so the
insert fails. Tests MAY create via API only the entities absent from the seed —
recipes, session templates, and cardio exercises (every seeded exercise is
`kind = 'strength'`) — and within one run the names they create for a given
entity MUST be unique across test files. Tests MUST use real dates (today, the
Monday of the current week, the following week) and MUST NOT encode a run offset
in a date or delete rows they did not create in order to free one.

#### Scenarios

- GIVEN "Press banca" is in the seeded catalog, WHEN a strength test needs that
  exercise, THEN it resolves the id via `GET /api/exercises` and issues no
  `POST /api/exercises` with that name.
- GIVEN a cardio exercise is needed, WHEN the test seeds it, THEN it POSTs a
  `kind: "running"` exercise tagged `cardio`, since no seeded exercise is cardio.
- GIVEN the suite creates recipes and templates, WHEN it runs twice in a row,
  THEN each run is green and no UNIQUE constraint is violated within a run.
- GIVEN a fresh e2e database, WHEN a test schedules a session, THEN it uses a
  real date and deletes no pre-existing session.
