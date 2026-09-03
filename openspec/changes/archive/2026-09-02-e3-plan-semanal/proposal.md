# Proposal — E3 plan semanal de comidas + lista de la compra

## Why

E1 shipped the meal-plan API (`/api/meal-plan/:week`) and CM1 moved the stack to a single Cloudflare Worker (Hono API under `/api/*` + React/Vite/Tailwind SPA + D1). The "Plan recetas" tab (`/plan-recetas`) is still the CM1 placeholder stub. E3 turns it into the weekly planner: a 7×3 grid (Lunes→Domingo × desayuno/almuerzo/cena) where each slot references a recipe via the existing API, plus the sticky "Lista de la compra" action — a server-side computed shopping list that aggregates ingredients from the week's planned recipes and keeps user-added manual items with checkboxes, grouped by supermarket section (per wireframe `pantalla-4-plan-recetas.txt`).

## What Changes

- Route `/plan-recetas` becomes the weekly planner (mobile: rows = days, columns = meals; desktop: columns = days, rows = meals — per wireframe). Week navigation (prev/next, ISO `YYYY-Www`).
- Empty slot = dashed "+ añadir" → recipe picker (search + list from `GET /api/recipes`). Filled slot = recipe name (+ thumbnail when E2 lands `photo_path`) → click navigates to recipe detail; inline remove/replace affordance. Slot writes go through the existing `PUT /api/meal-plan/:week` (whole-week replace).
- NEW API: `GET /api/shopping-list/:week` — server-side aggregation of ingredients across the week's planned slots (quantity summed per food+unit; a recipe planned N times counts N times), merged with persisted manual items, grouped by section in fixed order.
- NEW API: `PUT /api/shopping-list/:week/items` (replace manual item set), `GET /api/shopping-list/:week/items`, `PATCH /api/shopping-list/:week/items/:id` (toggle `checked`, edit fields).
- Data model: new `shopping_items` table; new nullable `section` column on `recipe_ingredients`. Delivered as a versioned D1 migration (`api/migrations/` + `wrangler d1 migrations apply`) — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is NOT valid D1 SQL (verified against wrangler 4.128 local D1), so idempotency comes from the wrangler migrations runner, not from SQL.
- Sticky "Lista de la compra" button opens the list view (mobile: full-screen sheet; desktop: side panel/bottom section per wireframe), with "+ añadir artículo" free-entry row at the end of each section.

## Scope

- Files: `api/src/routes/shopping-list.ts` (new), `api/src/index.ts` (mount), `api/src/api-validation.ts` (new Zod schemas + ingredient `section`), `api/src/repo.ts` (ingredient `section` in `loadRecipe`), `api/migrations/*` (new dir), `api/schema.sql` untouched (v1 baseline), `wrangler.toml` + root `package.json` (`migrations_dir`, `db:migrate:*` scripts), `web/src/routes/plan-recetas.tsx` + new planner/shopping components under `web/src/components/plan/`, tests under `api/tests/` and `web/tests/`.
- Non-goals: recipe editor changes (E2 — the picker only reads), photo upload, unit conversion (g vs oz are never merged), scaling quantities by servings, multiple shopping lists per week, auth (E7), "Hoy" page integration (E5 consumes the same API).

## Risks

- Medium: the whole-week `PUT /api/meal-plan/:week` replace semantics mean concurrent edits clobber; acceptable for a single-user personal app.
- Medium: migration tooling is new (repo only had `d1 execute --file`). Mitigated: `0001_baseline.sql` is a no-op so the runner's bookkeeping aligns with the already-migrated remote DB; `wrangler d1 migrations list` proves replay-safety before `apply`.
- Low: aggregation quality depends on consistent ingredient naming; mitigated by case-insensitive grouping + `section` override per ingredient.
- Rollback: revert the change commit; for the remote D1, `shopping_items` is additive and unread by old code, and `recipe_ingredients.section` is nullable — a plain revert of the Worker is safe without schema rollback (D1 Time Travel exists as the emergency net).

## Decisions this proposal takes

1. Section lives per ingredient (`recipe_ingredients.section`), applied as a Spanish-keyword default map at read time when NULL (open decision §5.1 of design — per-item default vs per-unit config).
2. The recipe book (E2) is re-based to `/recetas`; `/plan-recetas` is the weekly grid (the tab label "Plan recetas" matches the wireframe planner). Flagged to the E2 spec owner.
