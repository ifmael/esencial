# Design — E2 recetario

## Decisions

### D1: Client components + fetch to E1 BFF
`/plan-recetas` page is a client component tree (SPA decided in E0/D2). Data access via `fetch` to the existing `/api/recipes` routes — no new server code. A tiny `useRecipes` hook (list + create + update + delete + pending/error flags) keeps components dumb.

### D2: Detail as route segment, editor as overlay
Detail opens at `/plan-recetas/[id]` (shareable, back-button friendly). The create/edit editor renders as a modal overlay on top of the book (no route change) — cancel = close, no history pollution.

### D3: Client-side search only
Personal book < a few hundred recipes: filtering in memory (name substring + tags) is instant and adds zero API surface. Server-side search is explicitly deferred until the list is big enough to feel it (ponytail: measure first).

### D4: Photo = URL/path string + placeholder
Schema already has no photo column on recipes — add nullable `photo_path` via additive migration in `lib/schema.sql` (CREATE/TABLE ALTER guarded). UI shows placeholder asset when empty; real file upload wiring is a non-goal (decided with user at evaluation — options: local file dir under `data/`, or defer to Cloudflare/R2 in E7).

### D5: TDD for logic, component tests for behavior
Unit tests: `useRecipes` hook (with mocked fetch) and search filter function. Component tests (testing-library): editor validation (name required, no API call on invalid), empty/error states, delete confirmation. Visual styling verified manually against DESIGN.md at evaluation.

## Migration notes
Additive only: `ALTER TABLE recipes ADD COLUMN photo_path TEXT` guarded by pragma table_info check in schema bootstrap.
