# Proposal — E2 recetario: recipe book UI + editor (Cloudflare stack)

## Why

E1 + CM1 delivered the data layer: a Hono Worker serving `/api/recipes` over D1, and a React 19 + Vite SPA (`web/`) whose shell tab "Plan recetas" points at a placeholder route. The recipe book is the first real user-facing feature: browse/search recipes, open the detail, create/edit them. It is also the foundation E3 (weekly meal plan) picks recipes from. This change is the re-base of the original E2 spec to the ESSENTIAL stack (Cloudflare Worker + D1 + SPA), agreed after the CM1 pivot.

## What Changes

- New SPA route `/recetario` (the content the shell tab leads to): recipe book — header "Recetario", search field, "+ Nueva receta" button, recipe cards (thumbnail, name, tag chips) in a responsive desktop grid / mobile horizontal-card list — per wireframe `pantalla-5`. Route note (agreed with E3): the book lives at `/recetario`; `/plan-recetas` is reserved for the E3 weekly meal-plan grid, so the shell tab's label may be renamed at implementation.
- New SPA route `/recetario/:id`: recipe detail — photo, description, servings, ingredients checklist with quantities, numbered steps, material chips, tags, pencil → editor, delete with confirmation — per wireframe `pantalla-2`.
- "Nueva receta" editor (create + edit) as a modal overlay: name, description, servings, dynamic ingredient rows (food + quantity + unit), numbered steps (add/remove/reorder), material chips, free tags, optional photo field — consumes the existing `/api/recipes` endpoints.
- Small additive data-model delta (required by the wireframe's tag chips, absent in E1): nullable `photo_path` on `recipes` + `recipe_tags` junction; the recipes API round-trips both.
- Client-side data access via a `useRecipes` hook fetching same-origin `/api/recipes` (the Worker serves both API and assets; dev uses the Vite proxy). Loading/empty/error states per DESIGN.md.
- Search: client-side filter (name + tags) over the loaded list — the book is small (personal); server-side search deferred (YAGNI until it hurts).

## Scope

- Files: `web/src/routes/recetario*.tsx` (list + detail), `web/src/components/recipes/**` (cards, editor, hook), `web/tests/**` (vitest + testing-library), plus the additive versioned migration `api/migrations/0002_e2_recipes_photo_tags.sql` (E3 takes `0003`) and its round-trip in `api/src/` (schema validation, `loadRecipe`, routes).
- Non-goals: meal-plan integration (E3), photo **file upload** storage (only a URL/path string field; R2 upload deferred), shopping list, auth, server-side search.
- Rollback: revert commit; the migration is additive (dropping `photo_path`/`recipe_tags` loses no existing E1 data).

## Risks

- Medium-low: mostly UI over a stable, tested API. The API delta (tags + photo round-trip) touches E1 routes — mitigated by extending existing api tests RED→GREEN before the UI lands.
- Photo handling UX without upload may feel incomplete — mitigated: URL/path field + placeholder image; real upload (R2) is an explicit open decision for the user at evaluation.

## Decision

Approve to proceed with implementation of this change (tasks strictly RED→GREEN per `strict_tdd`).
