# Proposal — E2 recetario: recipe book UI + editor

## Why

E1 delivered the data layer (recipes API). The recipe book (`/plan-recetas`) is the first user-facing feature: browse/search recipes, open the detail, and create/edit them. It is also the foundation E3 (weekly meal plan) picks recipes from. Per the agreed model, implementation is delegated to specialized build agents after user validates this spec.

## What Changes

- Route `/plan-recetas`: recipe book — search field, "+ Nueva receta" button, recipe cards (photo, name, tag chips) in a responsive grid (desktop) / horizontal cards (mobile), per wireframe `pantalla-5`.
- Recipe detail view (modal or route): photo, description, servings, ingredients checklist with quantities, numbered steps, material chips — per wireframe `pantalla-2`.
- "Nueva receta" editor (create + edit): form with name, description, servings, dynamic ingredient rows (food + quantity + unit), numbered steps (addable/reorderable), material chips, optional tags — reuses the E1 API.
- Client-side data access via fetch to the E1 BFF routes; loading/empty/error states per DESIGN.md.
- Search: client-side filter (name + tags) over the loaded list — the book is small (personal); server-side search deferred (YAGNI until it hurts).

## Scope

- Files: `app/app/plan-recetas/**`, shared UI components under `app/components/recipes/`, tests under `app/tests/ui/`.
- Non-goals: meal plan integration (E3), photo file storage (photo URL/path field only; upload wiring deferred), shopping list, auth.

## Risks

- Medium-low: pure UI feature over a stable, tested API. Rollback = revert commit.
- Photo handling UX without upload may feel incomplete — mitigated: URL/path field + placeholder image; upload decided with user during evaluation.

## Decision

Approve to proceed with `sdd-spec` for E2 (this change).
