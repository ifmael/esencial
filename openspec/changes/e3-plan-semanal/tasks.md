# Tasks — E3 plan semanal + lista de la compra

> Stack: single Worker (Hono API `/api/*` + React/Vite/Tailwind SPA) + D1 (CM1).
> Strict TDD: every (RED, GREEN) pair names its failing test first. Test commands:
> `pnpm --filter api test <file>` / `pnpm --filter web test <file>` (never the whole suite mid-flight).

## 1. Data layer (migrations)

- [ ] 1.1 RED: `api/tests/contract.test.ts` — assert `shopping_items` and `recipe_ingredients.section` exist after `freshDb()` (PRAGMA table_info), and re-applying the migration set a second time neither errors nor duplicates rows. GREEN: add `api/migrations/0001_baseline.sql` (no-op) + `0003_e3_shopping.sql` (`CREATE TABLE IF NOT EXISTS shopping_items` per design D2 + `ALTER TABLE recipe_ingredients ADD COLUMN section TEXT`; numbered 0003 because E2 owns `0002_e2_recipes_photo_tags.sql`); extend `api/tests/helpers.ts` to apply every `0002+` migration file after `schema.sql` and add `shopping_items` to the `TABLES` clear list.
- [ ] 1.2 Wire the runner: `migrations_dir = "api/migrations"` in `wrangler.toml` `[[d1_databases]]`; root `package.json` scripts `db:migrate:local|remote` → `wrangler d1 migrations esencial --local|--remote`; header note in `api/schema.sql` pointing to `api/migrations/`. Verify locally: `pnpm db:migrate:local` twice → second run applies 0 statements; `wrangler d1 migrations list esencial --local` clean.
- [ ] 1.3 GREEN (no new test): `loadRecipe` in `api/src/repo.ts` returns `section` per ingredient (SELECT gains the column); existing recipes tests stay green.

## 2. Shopping-list API (TDD)

- [ ] 2.1 RED: `api/tests/shopping-list.test.ts` — `GET /api/shopping-list/2030-W01` → 200 `{ isoWeek, sections: [] }`; invalid week → 400 `{ field: "week" }`. GREEN: `api/src/routes/shopping-list.ts` skeleton (week validation via `ISO_WEEK`, `guard`), mounted at `/api/shopping-list` in `api/src/index.ts`.
- [ ] 2.2 RED: aggregation tests — recipe planned twice doubles quantities (tomate 200 g ×2 → 400 g); same food different unit → two lines; NULL quantity → item without quantity; case-insensitive food merge; sections in fixed order ["Frutas y verduras","Carnes","Lácteos","Despensa"] then others alphabetical; keyword default map puts "tomate" in "Frutas y verduras", "pechuga de pollo" in "Carnes", "leche" in "Lácteos", unknown food in "Despensa"; explicit ingredient `section` beats the map. GREEN: plan-join query (design D4) + JS aggregation + keyword map module-local.
- [ ] 2.3 RED: ingredient `section` round-trip — POST recipe with `ingredients:[{food:"tomate",quantity:200,unit:"g",section:"Despensa"}]` → generated list groups it under "Despensa"; payload without `section` still 201. GREEN: optional `section` in `ingredientSchema` (`api/src/api-validation.ts`) + insert column in `api/src/routes/recipes.ts` child statements.
- [ ] 2.4 RED: manual items CRUD — `PUT .../2026-W36/items {items:[{food:"Pan"},{food:"Aceitunas",checked:true}]}` → 2 rows with positions, `week_plans` row auto-created; second PUT replaces wholesale; `GET .../items` reads them; empty `food` → 400 `{field}` nothing written. GREEN: batch upsert+delete+reinsert (mirror `meal-plan.ts` PUT), `shoppingItemsSchema` in `api-validation.ts`.
- [ ] 2.5 RED: `PATCH .../items/:id` — `{checked:true}` flips only `checked`; `{food:"X",quantity:2}` updates both; unknown id → 404 `{error}`; `{}` → 400. GREEN: `parseId` + picked-subset UPDATE returning the row via `row()`.
- [ ] 2.6 RED: composed view mixes manual items into sections (checked state preserved); deleting a planned recipe removes its lines from `GET /api/shopping-list/:week` while manual lines survive. GREEN: merge in the GET handler (no new persistence).

## 3. Planner UI (TDD, mocked fetch per web/tests convention)

- [ ] 3.1 RED: `web/tests/meal-plan.test.tsx` — grid renders 7 days × 3 meals with Spanish labels from a stubbed `GET /api/meal-plan/:week`; empty week → 21 "+ añadir"; API error → retry card. GREEN: `useMealPlan` hook + grid in `web/src/routes/plan-recetas.tsx` (replaces the E3 stub; mobile rows-days, desktop `md:` columns-days).
- [ ] 3.2 RED: week navigation — ‹/› change the fetched week and the `?week=` query param; ISO edge case 2026-W52 → 2027-W01 computed by a pure `isoWeek` helper (`web/src/lib/iso-week.ts`) unit-tested directly. GREEN: helper + controls.
- [ ] 3.3 RED: picker — "+ añadir" opens an overlay listing fetched recipes; typing filters client-side without extra fetch; choosing calls PUT with the full slot set including the new one and renders the name; PUT 400 → grid keeps server state + error visible. GREEN: `RecipePicker` overlay + `useRecipes` reuse (import from E2 module if landed, else local fetch of `GET /api/recipes`).
- [ ] 3.4 RED: filled slot — cell shows name + placeholder thumbnail; clicking navigates to `/recetario/{id}`; separate remove affordance PUTs the week without that slot (confirm step). GREEN: slot component split (button inside cell, `event.stopPropagation`).
- [ ] 3.5 Route/tab alignment check: shell tab still points at `/plan-recetas` (rename owned by E2 if it lands first — coordinate, do not double-edit `shell.tsx`).

## 4. Shopping-list UI (TDD)

- [ ] 4.1 RED: `web/tests/shopping-list.test.tsx` — sticky "Lista de la compra" button opens the sheet/panel; grouped sections render with quantities; recipe lines have no checkbox; manual lines do; API error state inside the list. GREEN: `useShoppingList` hook + `ShoppingListSheet` component (mobile full-screen, desktop side panel via `md:` classes).
- [ ] 4.2 RED: checking a manual item fires `PATCH .../items/:id {checked}` and renders the green completion style. GREEN: wire checkbox → PATCH → state from response.
- [ ] 4.3 RED: "+ añadir artículo" row per section: confirm (Enter/blur) sends `PUT .../items` with existing manual items + the new one, item appears under that section; empty input sends nothing. GREEN: local append + full-set PUT (design D6).

## 5. Verify & close

- [ ] 5.1 Targeted suites green: `pnpm --filter api test shopping-list meal-plan contract` and `pnpm --filter web test` (full project run belongs to the orchestrator's final gate, not this change's inner loop).
- [ ] 5.2 Migration rehearsal on a copy of local state: `pnpm db:migrate:local` twice + `wrangler d1 migrations list` → all applied, replay clean; `pnpm dev` smoke: plan a week, open list, add + check a manual item against real D1.
- [ ] 5.3 Browser smoke (desktop + 375 px): picker → grid → list → checkbox journey; labels Spanish; touch targets ≥44 px.
- [ ] 5.4 Update project-site roadmap tree (E3 done), archive change, joint evaluation. Remote migration (`--remote`) is executed by the user at deploy time — documented in DEPLOY.md line added with the change.
