# Design — E0 scaffold

## Versions (pinned at scaffold, 2026-09-02)

Node 24.20.0 LTS Krypton (default via nvm; LXC instalará la misma LTS) · npm 11.19.0 ·
Next 16.3.4 (latest) · React 19.2.8 (latest) · Tailwind 4.3.3 (latest) ·
better-sqlite3 13.0.3 (latest) · TypeScript 5.9.3 (latest 7.0.2 is brand-new major; stays on 5.x for Next compatibility — revisit at E7) ·
ESLint 9.39.5 (latest 10.9.1 same situation) · Vitest 4.1.11 (latest) · @testing-library/react 16.3.3 (latest).

## Decisions

### D1: app lives in `app/` subdirectory
`create-next-app` scaffold at `esencial/app/` (root already contains `openspec/`, `project-site/`, `wireframes/`; create-next-app refuses non-empty roots and these must not ship inside the app bundle). Next only compiles its own tree; the repo root stays the product home. `npm run dev` runs from `app/`.

### D2: SPA rendering mode
App Router with every page as a client component tree (`app/(app)/...` layout renders the shell client-side). No server rendering needs (single-user, no SEO). API routes (`app/api/*`) are server-only by definition and will be the only SQLite access layer (E1+). This preserves the API+front split decided in Fase 4 while staying inside one Next project.

### D3: SQLite driver — better-sqlite3 v13.0.3
Synchronous, zero-config, perfect for single-user LAN app. E0 does NOT create or open any database file: `data/` holds only a `.gitkeep` placeholder; the actual `data/esencial.db` is created by E1's schema code. The LXC will keep this same `data/` directory (bind mount / volume), so "DB lives in the container" means "the container runs the app that owns `data/esencial.db`" — identical path in dev and in the LXC, so backups (`vzdump` or cron copy of the .db) work the same. Connection helper (`lib/db.ts`) deferred to E1.

### D4: Shell per wireframes
`app/(app)/layout.tsx` renders `Shell` component: bottom tabs (mobile) / sidebar (desktop) driven by a 3-item nav array. Routes: `/` (Hoy), `/plan-recetas`, `/plan-fuerza`. Date header state lives in the Día page component (client state; E1 moves it to a store when real data lands).

## Test plan (TDD)

- `lib/` smoke test: date-header helper (`nextDay`/`prevDay`/`formatDateEs`) unit-tested with vitest.
- Shell test (vitest + testing-library): renders 3 destinations; active state follows route.
- `npm run build` must pass (type + lint gate).
