# Proposal — E0 scaffold: Next.js + SQLite + dev command + navigation

## Why

Esencial needs its app foundation before any feature epic (E1..E7). The product definition is complete (project-site roadmap), the stack decided (Next.js full-stack, SPA rendering, SQLite via BFF-only API routes, LXC Proxmox target). This change creates the runnable skeleton.

## What Changes

- Create the Next.js app (App Router, TypeScript) at the repo root; `project-site/` and `openspec/` stay untouched siblings.
- Add Tailwind CSS; import the visual system from `wireframes/DESIGN.md` as Tailwind theme tokens.
- SQLite via better-sqlite3 with a `data/` directory (gitignored) — only API routes will touch it (no schema yet; E1 adds it).
- Navigation shell: mobile bottom tabs (Hoy / Plan recetas / Plan fuerza) + desktop sidebar, per wireframes.
- Empty Día (Today) screen as home at `/`.
- `npm run dev` starts the app; `npm test` runs vitest (RED-GREEN-REFACTOR from E1 on; E0 ships a trivial smoke test).

## Scope

- Files: app scaffold only (`app/`, `lib/`, config files at root).
- Non-goals: any data model, any CRUD, any real screen content, auth, deployment.

## Risks

- Low. Scaffold-only change; rollback = delete generated files (git-tracked before merge).

## Decision

Approve to proceed with `sdd-spec` for E0.
