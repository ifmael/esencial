# Design — E2 recetario (Cloudflare stack)

Re-based after CM1: one Cloudflare Worker serves the Hono API under `/api/*` and the built SPA from `web/dist` as static assets — the SPA talks same-origin to the Worker; there is no server-rendering or BFF layer.

## Decisions

### D1: `useRecipes` hook fetching same-origin `/api/recipes`
Data access lives in one hook (`web/src/components/recipes/use-recipes.ts`): `list` (GET `/api/recipes`), `create` (POST), `update` (PUT `/api/recipes/:id`), `remove` (DELETE), plus `loading` / `error` / `saving` flags. Real contract (verified in `api/src/routes/recipes.ts`): GET list returns fully hydrated recipes (`{id, name, description, servings, photo_path, ingredients:[{id,food,quantity,unit}], steps:[{id,position,text,step}], materials:[string], tags:[string]}`); POST/PUT accept `{name, description?, servings?, photo_path?, ingredients?, steps?, materials?, tags?}`; PUT replaces children wholesale; DELETE returns 204; name collisions return 400 `{error, field}`. Because the list is fully hydrated, the detail screen can read from the already-fetched list; `GET /api/recipes/:id` exists for direct deep-links. In dev, Vite proxies `/api` to `wrangler dev` (8787); in prod same origin. No new server code beyond the E2 delta (D4).

### D2: Detail as route, editor as overlay
`web/src/app.tsx` (react-router 7 declarative) gains two nodes under the existing placeholder: `/recetario` (book) and `/recetario/:id` (detail). Detail is shareable and back-button friendly. The create/edit editor renders as a modal overlay on top of the current screen (no route change) — cancel = close, no history pollution.

### D3: Client-side search only
Personal book < a few hundred recipes: one GET on mount, filter in memory (name substring case-insensitive + tag match). Instant, zero extra API surface. Server-side search deferred (ponytail: measure first).

### D4: Photo = nullable `photo_path` string + tags junction (additive D1 delta)
The wireframe's cards show tag chips and a thumbnail, but E1's schema has neither for recipes. Minimal delta:
- `ALTER TABLE recipes ADD COLUMN photo_path TEXT` (nullable) and `CREATE TABLE IF NOT EXISTS recipe_tags(recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, tag TEXT NOT NULL, PRIMARY KEY(recipe_id, tag))`.
- Delivered as versioned D1 migration `api/migrations/0002_e2_recipes_photo_tags.sql` applied by `wrangler d1 migrations apply` (runner bookkeeping in `_cf_D1_MIGRATIONS` makes each file run exactly once — the only safe idempotency mechanism on D1; plain `ALTER` is fine there). Convention shared with E3 (who takes `0003_e3_shopping.sql`): `api/schema.sql` stays the untouched v1 baseline for fresh bootstraps; `api/tests/helpers.ts` applies `schema.sql` then each `0002+` migration file in order, reproducing the runner's end state inside the vitest pool.
- API round-trip: `recipeSchema` gains `photo_path` (optional string) and `tags` (string array, same shape as exercises); `loadRecipe` selects `photo_path` and joins `recipe_tags`; POST/PUT insert tags in the same batch (`DELETE FROM recipe_tags WHERE recipe_id=?` before re-insert on PUT, mirroring materials).
- UI shows a placeholder asset when `photo_path` is empty. **Real file upload is a non-goal — open decision for the user at evaluation: (a) R2 bucket in E7, (b) external URL only, (c) ship without the field.** Naming stays snake_case here (`photo_path`), consistent with the rest of the recipe payload; camelCase normalization of the mixed naming is E6 debt, not E2's.

### Compat note (E3)
E3 (plan semanal) will additively introduce `section` (nullable TEXT on `recipe_ingredients`, optional in `ingredientSchema`). E2 does not surface it: its ingredient rows carry food + quantity + unit only, so an E2 PUT sends no `section` (null). Acceptable in sequence (E2 lands before any section data exists); if E2's editor is ever revisited after E3, the row editor gains the selector as an additive field.

### D5: TDD — vitest + testing-library (strict RED→GREEN)
API delta first: extend `api/tests/recipes.test.ts` (real local D1 via `vitest-pool-workers`, helpers in `api/tests/helpers.ts`) for photo_path/tags round-trip and 400 envelopes — RED, then GREEN in `api/src`. UI: hook tests with mocked `fetch`; search-filter helper unit test; component tests with `@testing-library/react` (jsdom, `web/tests/**/*.test.ts{x}`): editor validation (name required → no fetch call), empty/error states, delete confirmation. Styling verified manually against `wireframes/DESIGN.md`; final smoke is browser-driven against `pnpm dev`.

## Migration notes
Additive only, no data rewrite: `photo_path TEXT` on existing `recipes` rows → NULL; `recipe_tags` starts empty. Rollback = revert deploy; leftover column/table are inert for old code. Local application: `wrangler d1 migrations apply esencial --local` (and `--remote` at deploy time); numbering E2=`0002` precedes E3=`0003`, matching roadmap order.
