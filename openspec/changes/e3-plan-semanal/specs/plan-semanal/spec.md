# Spec — E3 plan semanal + lista de la compra

## ADDED Requirements

### Requirement: Weekly planner grid
The route `/plan-recetas` MUST render the weekly meal plan as a 7×3 grid: days Lunes→Domingo (slot `day` 0–6, Monday-first ISO) × meals desayuno/almuerzo/cena, for the selected ISO week (`YYYY-Www`). Mobile layout MUST stack days as rows with 3 meal columns; desktop layout MUST show days as columns and meals as rows. Each cell MUST be a touch target of at least 44px and use Spanish labels.

#### Scenarios
- Given week `2026-W36` has slots `{day:0, meal:"desayuno", recipeId:7}` and `{day:4, meal:"cena", recipeId:3}`, When `/plan-recetas?week=2026-W36` loads, Then the Lunes/desayuno cell shows recipe 7's name and Jueves/cena shows recipe 3's name, and the other 19 cells show "+ añadir".
- Given the API is unreachable, When the page loads, Then an error card with retry is shown (never a blank grid).
- Given no slots exist for the week, When the page loads, Then all 21 cells show the dashed "+ añadir" affordance and no error.

### Requirement: Week navigation
The planner MUST default to the current ISO week and MUST provide previous/next controls that change the visible week, with the week reflected in the URL query (`?week=YYYY-Www`) so the view is shareable and the back button restores the previous week.

#### Scenarios
- Given the current week is displayed, When the user taps "‹", Then the grid shows the previous ISO week (crossing January/December boundaries correctly) with no slots written.
- Given `?week=2026-W36` in the URL, When the page loads directly, Then that week's plan is fetched (not the current week).

### Requirement: Slot editing via recipe picker
Tapping an empty slot MUST open a recipe picker overlay listing recipes fetched from `GET /api/recipes` with a client-side name search. Choosing a recipe MUST fill the slot by sending `PUT /api/meal-plan/{week}` with the full resulting slot set. A filled slot MUST offer a remove (and replace) affordance that clears or swaps only that slot; the PUT body MUST NOT contain duplicate `(day, meal)` pairs.

#### Scenarios
- Given an empty Martes/almuerzo slot, When the user picks "Pollo al horno" from the picker, Then a PUT saves the slot, the cell shows the recipe name, and the picker closes.
- Given the picker is open with 10 recipes, When the user types "pol", Then only names containing "pol" (case-insensitive) are listed, with no extra network request.
- Given a filled slot, When the user taps remove and confirms, Then the slot disappears from the grid and `GET /api/meal-plan/{week}` no longer returns it.
- Given the PUT fails with a 400 `{ error, field }`, When the save returns, Then the grid reverts to server state and the error message is shown.

### Requirement: Filled slot navigation
A filled slot MUST show the recipe name (and photo thumbnail when the recipe has one, placeholder otherwise) and tapping the cell body MUST navigate to the recipe detail route; the remove/replace affordance MUST be separate from the navigation target.

#### Scenarios
- Given Sábado/cena holds "Lentejas", When the user taps the cell, Then the app navigates to the recipe detail of "Lentejas".
- Given the recipe behind a slot was deleted, When the plan is read, Then the slot renders empty ("+ añadir"), consistent with the existing API behavior (`recipeId: null`).

### Requirement: Shopping list data model
The database MUST gain a `shopping_items` table (id, week_plan_id FK → week_plans ON DELETE CASCADE, position, food NOT NULL, quantity REAL NULL, unit NULL, section NULL, checked INTEGER DEFAULT 0) and a nullable `section` column on `recipe_ingredients`. The change MUST be delivered as a versioned D1 migration under `api/migrations/` applied by `wrangler d1 migrations apply`; the migration MUST be safe to run exactly once per database (runner bookkeeping) and re-applying the full migration set MUST NOT error or duplicate data. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` MUST NOT be used (unsupported in D1).

#### Scenarios
- Given a database already migrated to v1, When `wrangler d1 migrations apply esencial --local` runs, Then `shopping_items` exists, `recipe_ingredients.section` exists, existing recipe rows keep their data with `section = NULL`, and the migration is recorded.
- Given migrations were already applied, When `migrations apply` runs again, Then no statement re-executes and no error occurs.
- Given a fresh test bootstrap, When `api/tests/helpers.ts` initializes D1, Then `schema.sql` plus every migration file apply in order and produce the same end state.

### Requirement: Generated shopping list endpoint
`GET /api/shopping-list/{week}` MUST return the week's shopping list grouped by section, in the fixed display order "Frutas y verduras", "Carnes", "Lácteos", "Despensa" followed by any other sections alphabetically. Recipe-derived lines MUST be computed server-side from the week's planned slots joined with their ingredients (never stored), summing `quantity` per `(food, unit)` case-insensitively, multiplying by the number of slots referencing each recipe, and attributing each line's section from the ingredient's `section` when set, else from the Spanish keyword default map. Manual items MUST be included from `shopping_items` with their stored `checked` state. Unknown-but-valid weeks MUST return 200 with an empty list; an invalid week format MUST return 400 `{ error, field: "week" }`.

#### Scenarios
- Given "Ensalada" (tomate 200 g, lechuga 1 ud) planned twice in the week, When `GET /api/shopping-list/2026-W36`, Then tomate appears once with quantity 400 g in "Frutas y verduras" and lechuga with quantity 2.
- Given an ingredient with `quantity NULL` (aceite de oliva), When the list is generated, Then the item appears without a quantity instead of being dropped.
- Given an ingredient row with explicit `section "Despensa"` for "tomate triturado", When grouped, Then it lands in "Despensa" even though the keyword map would say "Frutas y verduras".
- Given no plan exists for `2030-W01`, When `GET /api/shopping-list/2030-W01`, Then 200 with `{ isoWeek: "2030-W01", sections: [] }`.
- Given `GET /api/shopping-list/semana-mala`, Then 400 with `field: "week"`.
- Given a planned recipe is deleted, When the list is re-read, Then its ingredient lines are gone and manual items remain.

### Requirement: Manual shopping item endpoints
`PUT /api/shopping-list/{week}/items` MUST replace the week's manual item set (items: food required non-empty, optional quantity/unit/section/checked/position), creating the `week_plans` row if absent, in a single D1 batch. `GET /api/shopping-list/{week}/items` MUST return the stored manual rows. `PATCH /api/shopping-list/{week}/items/{id}` MUST accept a partial body with at least one of `food`, `quantity`, `unit`, `section`, `checked`, update only the given fields, and return the updated row; an unknown id MUST return 404 `{ error }`. All three MUST reuse the standard envelope: 400 `{ error, field? }` on invalid input with nothing written.

#### Scenarios
- Given week `2026-W36` with 2 manual items, When `PUT` with 1 item `{ food: "Pan" }`, Then `GET .../items` returns exactly one row "Pan" with `checked: 0`, position preserved.
- Given a manual item unchecked, When `PATCH` with `{ checked: true }`, Then the row is checked and other fields are untouched.
- Given `PATCH /api/shopping-list/2026-W36/items/999` where 999 does not exist, Then 404 `{ error }` and no write.
- Given `PUT` with an item whose `food` is empty, Then 400 with the field and no change to stored items.
- Given an empty body `{}` on PATCH, Then 400 (at least one updatable field required).

### Requirement: Shopping list UI
The planner MUST expose a sticky primary button "Lista de la compra" that opens the generated list (mobile: full-screen sheet; desktop: side panel or bottom section). Each section MUST render as a group with its items showing name, aggregated quantity + unit, and a checkbox for manual items (recipe lines are not individually checkable). Each section MUST end with a "+ añadir artículo" free-entry row (name, optional quantity + unit) that persists via `PUT .../items`. Checking an item MUST call `PATCH` and mark it with the completion style (green), keeping it in place.

#### Scenarios
- Given the list is open, When the user checks "Pan" (manual), Then it renders checked and the PATCH request succeeds.
- Given the user types "Detergente" in the "Despensa" free-entry row and confirms, When the list refreshes, Then "Detergente" is a manual item under "Despensa".
- Given a recipe-derived line "Arroz 480 g", When the user looks for a checkbox, Then none is offered (it exists only while planned).
- Given the button is tapped while the API is down, Then an error state with retry shows inside the list surface, not a silent empty list.

### Requirement: API surface consistency
The new routes MUST be mounted at `/api/shopping-list` in the single Worker, reuse `guard`/`fail`/`zBody`/`parseId` helpers, Zod schemas in `api/src/api-validation.ts`, and produce the same JSON envelope vocabulary as the existing 13 routes (400 `{error, field?}`, 404 `{error}`, 500 generic without SQL leakage). `ingredientSchema` MUST accept optional `section` so E2 payloads without it remain valid.

#### Scenarios
- Given an E2-style recipe POST with ingredients lacking `section`, Then 201 and the stored rows have `section NULL`.
- Given any unforeseen D1 failure inside the new routes, Then 500 `{ error: "Internal server error" }` with no SQL text.
