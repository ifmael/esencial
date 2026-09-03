# Design — E3 plan semanal + lista de la compra

## Context (source-of-truth facts)

- API surface today (verified in `api/src`): 13 routes + `/api/health`, mounted in `api/src/index.ts`; envelopes `{ error, field? }` via `http.ts` (`fail`/`guard`/`dbFailure`, UNIQUE→400, FK→400 `reference`, else 500). Meal plan: `GET|PUT /api/meal-plan/:week` with `ISO_WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/`, whole-week replace, duplicate `(day, meal)` in one PUT → 400, deleted recipe → slot reads `recipeId: null`.
- Schema (`api/schema.sql` v1): `week_plans(iso_week UNIQUE)`, `meal_slots(day 0-6, meal CHECK desayuno|almuerzo|cena, recipe_id REFERENCES recipes ON DELETE RESTRICT, UNIQUE(day,meal,week_plan_id))`, `recipe_ingredients(id, recipe_id, position, food, quantity REAL, unit)`.
- `web/src/routes/plan-recetas.tsx` is the CM1 stub: header "Plan recetas" + "Planificador semanal — llega en E3". The shell tab `/plan-recetas` ("Plan recetas") is therefore the weekly planner route; the recipe book (E2) must live at `/recetario`.
- D1 constraint (verified with wrangler 4.128 against local D1): `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` → syntax error; a second plain `ADD COLUMN` → `duplicate column name: section`. So "idempotent migration" MUST come from a versioned runner, not from SQL text.
- Tests run in `@cloudflare/vitest-pool-workers` against real local D1, bootstrapped by `api/tests/helpers.ts` which applies `schema.sql?raw` once and clears `TABLES` per file.

## Decisions

### D1: Versioned D1 migrations replace the raw `d1 execute --file` flow

Add `api/migrations/` managed by `wrangler d1 migrations apply esencial --local|--remote` (wrangler records applied files in `_cf_D1_MIGRATIONS`, making each migration run exactly once — the only safe idempotency mechanism on D1, see Context). Layout:

- `api/migrations/0001_baseline.sql` — a comment-only no-op, so existing already-bootstrapped DBs (local and remote, migrated via `schema.sql`) align with the runner without re-running anything.
- `api/migrations/0003_e3_shopping.sql` — `CREATE TABLE IF NOT EXISTS shopping_items (...)` (already idempotent) + plain `ALTER TABLE recipe_ingredients ADD COLUMN section TEXT` (runs once thanks to the runner). Numbered 0003 because E2's delta owns `0002_e2_recipes_photo_tags.sql` (roadmap order; the runner applies by filename).
- `api/schema.sql` stays the v1 full baseline for fresh test bootstraps and gets an `-- NOTE: additive changes now live in api/migrations/` header pointing forward; `api/tests/helpers.ts` applies `schema.sql` **then** each `0002+` migration file in order (raw-imported like `schema.sql?raw`), reproducing the runner's end state without needing wrangler inside the vitest pool.

`wrangler.toml`: add `migrations_dir = "api/migrations"` to the `[[d1_databases]]` block. Root `package.json`: `db:migrate:local|remote` scripts switch to `wrangler d1 migrations esencial --local|--remote` (apply). Rationale: one mechanism, replay-safe, reviewable diff per change; the SQL-IF-NOT-EXISTS trick is unavailable for ALTER. Alternatives rejected: guarded ALTER via `PRAGMA table_info` read in JS at Worker boot (schema mutation on the request path — rejected); rewriting `schema.sql` destructively (loses the v1 audit trail E1/CM1 established).

Downside to own: `db:migrate:local` changing semantics is a workflow note for the user (old command still works for the baseline; migration state lives per-DB in `.wrangler/state` locally).

### D2: `shopping_items` table

```sql
CREATE TABLE IF NOT EXISTS shopping_items (
  id           INTEGER PRIMARY KEY,
  week_plan_id INTEGER NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  food         TEXT NOT NULL,
  quantity     REAL,
  unit         TEXT,
  section      TEXT,
  checked      INTEGER NOT NULL DEFAULT 0
);
```

Manual list items are **per week plan** (the wireframe list is "the generated shopping list" of a week). CASCADE mirrors `meal_slots`; deleting a recipe leaves manual items untouched (they are not FK'd to recipes). `week_plans` rows are created lazily by meal-plan PUT; manual-item PUT also upserts the `week_plans` row (same `INSERT OR IGNORE` pattern as `meal-plan.ts`). `position` preserves insertion order for the replace-all PUT.

### D3: `section` lives on the ingredient row; default map fills NULLs at read time

`recipe_ingredients.section TEXT NULL`. Aggregation groups into sections with this precedence: explicit `section` on the ingredient row → else a keyword default map (Spanish food nouns: tomate/lechuga/pimiento…→"Frutas y verduras"; pollo/carne/pescado/huevos…→"Carnes"; leche/queso/yogur…→"Lácteos"; else "Despensa"). OPEN DECISION (see §Open): per-item default map (this design) vs configurable per-unit store taxonomy — the map is ~15 lines and zero UI; if the user wants admin-editable taxonomy, the map becomes a seeded table with no API change to the list shape. Fixed display order: `["Frutas y verduras", "Carnes", "Lácteos", "Despensa"]`, unknown sections after, alphabetical.

`ingredientSchema` gains optional `section: z.string().optional().nullable()` — E2 editor is unaffected (absent → NULL). `loadRecipe` returns `section` so the editor can round-trip it later.

### D4: Shopping-list read is computed, never stored

`GET /api/shopping-list/:week` returns `{ isoWeek, sections: [{ section, items: [...] }] }` where each item carries `source: "recipe" | "manual"` (recipe items also carry `recipeIds: number[]`, `count`; manual items carry `id`, `checked`). Aggregated recipe lines are NOT persisted — recomputed from `meal_slots ⋈ recipe_ingredients` on every read; this guarantees the list can never drift from the plan, and deleting a recipe auto-removes its ingredients (parity with "slot reads empty" semantics). Only manual items and their `checked` state live in the DB. Quantities sum numerically per `(lower(food), lower(coalesce(unit,'')))`; multipliers count slot occurrences (a recipe in 3 slots triples its ingredients — the honest MVP for a whole-week list); non-numeric/NULL quantities render as unit-less lines (e.g. "aceite de oliva, c/s"). No unit conversion (ponytail: `g` + `g` merge; `g` + `ml` stay separate lines; a real conversion table is a later epic if it ever hurts).

SQL sketch (single D1 query, aggregation in JS for the count-join):

```sql
SELECT ri.food, ri.quantity, ri.unit, ri.section, ms.recipe_id
FROM meal_slots ms
JOIN recipe_ingredients ri ON ri.recipe_id = ms.recipe_id
WHERE ms.week_plan_id = (SELECT id FROM week_plans WHERE iso_week = ?) AND ms.recipe_id IS NOT NULL
```

### D5: Manual-item endpoints follow the week-replace pattern

- `PUT /api/shopping-list/:week/items` — body `{ items: [{ food, quantity?, unit?, section?, checked? }] }`: upsert week, delete-then-reinsert in one `db.batch` (identical shape to `mealPlan` PUT; `food` min(1) required, unknown fields rejected by `z.object`).
- `GET /api/shopping-list/:week/items` — raw manual rows (the composed view uses it internally; the endpoint exists for tests/rebases).
- `PATCH /api/shopping-list/:week/items/:id` — partial body `{ food?, quantity?, unit?, section?, checked? }`, at least one key, Zod-picked subset → `UPDATE ... SET` only given columns; unknown id → 404 `{ error }` (same 404 vocabulary as notes/templates routes).
- All validate `:week` against `ISO_WEEK` → 400 `field: "week"`, reusing `zBody`/`guard`/`fail`/`parseId`; new route file `api/src/routes/shopping-list.ts` mounted at `/api/shopping-list`.

The `GET /api/shopping-list/:week` composed response embeds manual items grouped into the same section buckets (explicit `section` column → keyword map → "Despensa").

### D6: Front — one client hook per table, optimistic-free

- `useMealPlan(isoWeek)`: GET on week change; slot add/remove/replace → build the next full slot array and `PUT` (server response replaces local state; no optimistic writes — a personal app tolerates ~100 ms, and whole-week PUT makes races loud instead of silent).
- `useShoppingList(isoWeek)`: GET composed list; checkbox → `PATCH items/:id`; "+ añadir artículo" row per section → local append then debounced full `PUT items` on blur/enter (replace-all is simpler than per-row POST/DELETE and matches D5).
- Recipe picker: single overlay, search filters the already-fetched `GET /api/recipes` client-side (same call + same YAGNI stance as E2 D3). Picking a recipe writes only the touched slot through the week PUT.
- Week navigation: prev/next buttons computing ISO weeks from the Monday-anchor rule `day = (getUTCDay() + 6) % 7` (agreed with E5; ISO-8601 weeks, Monday=0…Sunday=6 — matches `meal_slots.day CHECK(0-6)` and the L-D grid). Current-week default; URL carries the week (`/plan-recetas?week=2026-W36`) so the view is shareable.
- Layout per wireframe: mobile rows = days (L-D), columns = 3 meals; desktop columns = days, rows = meals; sticky primary button "Lista de la compra" (#15803D) opens the list (mobile full-screen sheet, desktop side panel); empty slots dashed "+ añadir"; 44px touch targets; Spanish labels; filled slot shows recipe name + thumbnail placeholder until E2 ships `photo_path`, and navigates to `/recetario/:id`.

### D7: TDD seams

- API tests (`api/tests/shopping-list.test.ts`, real D1): aggregation math (sum per food+unit, multiplier per slot count, NULL quantity, section precedence, deterministic order), empty/unknown week → `{ isoWeek, sections: [] }` shape, invalid week → 400 `{ field: "week" }`, PUT/GET/PATCH manual items incl. 404 + checked round-trip, recipe delete → ingredient lines vanish while manual lines survive.
- Migration test: applying `0003` twice (directly and via helpers' bootstrap) does not error or duplicate; `shopping_items` CASCADE on week delete is out of scope (weeks are never deleted by any route — only its rows are replaced).
- Web tests (vitest + testing-library, mocked fetch per existing `web/tests` convention): grid renders 7×3 from slot payload; "+ añadir" opens picker and search filters; picking PUTs the full week; remove affordance clears one slot; list groups by section with checkbox → PATCH; free-entry row → PUT.

## Migration notes

Additive only, executed once by the wrangler runner (see D1): new `shopping_items` table (FK to `week_plans` with CASCADE) and nullable `recipe_ingredients.section TEXT`. No data backfill; existing rows read with `section = NULL` and fall back to the D3 keyword map. Remote apply is the user's deploy step (`wrangler d1 migrations apply esencial --remote`); Time Travel covers emergencies. Rollback = revert Worker code (columns/tables unread by old code are inert).

## Open decisions (for the user)

1. Section ownership: per-ingredient default keyword map (this design, zero UI) vs admin-configurable taxonomy table vs per-unit setting — pick one before implementation.
2. Quantity multiplier: count a recipe once per planned slot (this design) vs once per unique recipe — affects list size for repeat-heavy weeks.
3. E2 route re-base confirmation: recetario → `/recetario`, planner keeps `/plan-recetas` (the stub and tab already say so).
