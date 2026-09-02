# Tasks — E2 recetario (Cloudflare stack)

> Re-based 2026-09-02 to the ESSENTIAL stack (Worker + D1 + React/Vite SPA) after cm1-migracion-cloudflare. Strict RED→GREEN per `strict_tdd`.

## 1. Foundation (TDD)

- [ ] 1.1 RED+GREEN: D1 photo/tags delta — failing round-trip assertions in `api/tests/recipes.test.ts` (POST/GET with `photo_path` + `tags`, PUT replaces tags, cascade on DELETE); then GREEN via versioned migration `api/migrations/0002_e2_recipes_photo_tags.sql` (`schema.sql` stays v1 baseline; `api/tests/helpers.ts` chains `schema.sql` + `0002+` in order) + `recipeSchema` + `loadRecipe`/route inserts; apply locally with `wrangler d1 migrations apply esencial --local`
- [ ] 1.2 RED+GREEN: `useRecipes` hook (`web/tests/` with mocked `fetch`) — list on mount, create/update/remove mutate + refresh, `saving` flag, error captured from `{error, field}` envelope
- [ ] 1.3 RED+GREEN: search filter helper — name substring case-insensitive + tag match; empty query returns all

## 2. Recipe book screen (TDD)

- [ ] 2.1 RED+GREEN: `/recetario` renders cards (name, tag chips, placeholder thumbnail) from hook data; loading state while in flight
- [ ] 2.2 RED+GREEN: empty state (invite to create first recipe) and API-error state with retry button
- [ ] 2.3 RED+GREEN: search field filters cards client-side (no `fetch` call); clearing restores all
- [ ] 2.4 Responsive layout per wireframe `pantalla-5` (grid desktop / horizontal cards mobile) — visual check at evaluation

## 3. Recipe detail (TDD)

- [ ] 3.1 RED+GREEN: `/recetario/:id` renders photo/placeholder, description, servings, ordered ingredients checklist (quantity + unit), steps numbered 1..N, material chips, tags — from hydrated list or GET by id on deep link
- [ ] 3.2 RED+GREEN: delete with confirmation — confirm calls DELETE, card disappears from book, brief success state; cancel changes nothing
- [ ] 3.3 RED+GREEN: pencil action opens the editor pre-filled in edit mode

## 4. Recipe editor (TDD)

- [ ] 4.1 RED+GREEN: create flow — valid payload POSTs to `/api/recipes`, new card appears, modal closes
- [ ] 4.2 RED+GREEN: validation — empty name shows field error, zero API calls; server 400 `{error, field}` surfaces next to the named field with data preserved
- [ ] 4.3 RED+GREEN: edit flow — PUT on save replaces children wholesale; cancel discards without any API call
- [ ] 4.4 RED+GREEN: dynamic rows — add/remove ingredient rows, add/remove/reorder steps, material chips add/remove, free tag input; submit disabled while saving (no duplicates)

## 5. Verify & close

- [ ] 5.1 `pnpm test` (api + web) green
- [ ] 5.2 Browser E2E smoke against `pnpm dev` (Worker + SPA): create → search → open detail → edit → delete journey
- [ ] 5.3 Update project-site tree (E2 done), archive change, joint evaluation (photo-upload decision from D4 open options)
