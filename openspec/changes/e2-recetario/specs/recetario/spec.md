# Spec — E2 recetario

## ADDED Requirements

### Requirement: Recipe book screen
The SPA route `/recetario` MUST render the recipe book: header with title "Recetario", a search field, and a primary button "+ Nueva receta"; below, recipe cards showing thumbnail (placeholder when `photo_path` is absent), name, and tag chips. Cards MUST be in a responsive grid on desktop and a single-column list of horizontal cards on mobile. Tapping a card navigates to the recipe detail. Data comes from `GET /api/recipes` (same-origin).

#### Scenarios
- Given 3 recipes exist, When `/recetario` loads, Then 3 cards render with name visible and a loading state is shown while the request is in flight.
- Given no recipes exist, When `/recetario` loads, Then an empty-state card invites creating the first recipe.
- Given the API is unreachable, When the page loads, Then an error card offers retry (no silent blank page).

### Requirement: Recipe search
The search field MUST filter the visible recipes client-side by name substring (case-insensitive) and by tag.

#### Scenarios
- Given recipes "Arroz con pollo" and "Ensalada", When the user types "arroz", Then only the matching card remains visible, without any network request.
- Given the user clears the search, When the field empties, Then all recipes reappear.

### Requirement: Recipe detail
The SPA route `/recetario/:id` MUST show: photo (or placeholder), name, description, servings, ingredients as a checklist with quantity + unit, numbered steps in order, material chips, and tag chips. A pencil action MUST open the editor in edit mode. A direct deep-link to an unknown or invalid id MUST show a not-found state, never a blank page.

#### Scenarios
- Given a recipe with 3 ordered ingredients and 4 numbered steps, When opened, Then they render in stored insertion order and numbering 1..4.
- Given the user taps the pencil, When the editor opens, Then all fields are pre-filled and changes only persist on explicit save.
- Given `/recetario/999` where 999 does not exist, When the route loads, Then a not-found message with a way back to the book is shown.

### Requirement: Recipe editor (create + edit)
The "+ Nueva receta" action MUST open the editor form with: name (required), description, servings (number ≥ 1), optional photo (URL/path string), dynamic ingredient rows (food, quantity, unit; add/remove rows), ordered steps (add/remove/reorder), material chips (add/remove), and free tags. Save MUST POST to `/api/recipes` (create) or PUT `/api/recipes/{id}` (edit); PUT replaces ingredients, steps, materials, and tags wholesale. An invalid save MUST show the field-level error from the 400 `{error, field}` envelope (duplicate name included) next to the named field. Cancel MUST discard all changes without any API call.

#### Scenarios
- Given the editor opened for create, When saved with name "Tortilla" and 2 ingredient rows, Then the API receives a valid payload, the book list shows the new card, and the form closes.
- Given the name is empty, When saved, Then a field error is shown next to the name field and no API call is made.
- Given a create with a name that already exists, When the API answers 400 `{error, field}`, Then the error renders beside the name field and the entered data is preserved.
- Given edit mode changed 1 step and the user cancels, When reopening the recipe, Then the original data is intact.

### Requirement: Deletion
A recipe detail MUST offer a delete action with a confirmation step. On confirm, DELETE `/api/recipes/{id}` is called (204 on success) and the card disappears from the book.

#### Scenarios
- Given a recipe open in detail, When the user confirms deletion, Then the card is removed from the list and a brief success state is shown.
- Given the user cancels the confirmation, When dismissing, Then nothing changes.

### Requirement: Recipe photo and tags (data delta)
The recipes API MUST round-trip an optional nullable `photo_path` string and an optional `tags` array of strings, persisted additively in D1 (`photo_path` column on `recipes`; `recipe_tags` junction removed on recipe cascade). Existing E1 payloads without these fields MUST keep working unchanged.

#### Scenarios
- Given POST `/api/recipes` with `photo_path` and `tags: ["almuerzo","batch"]`, When the recipe is fetched (list or by id), Then both fields are returned verbatim.
- Given PUT replacing `tags`, When the recipe is fetched, Then only the new tags are present.
- Given a DELETE of a tagged recipe, When a new recipe reuses the name, Then its tag set is independent (no leftovers).

### Requirement: Loading and interaction states
All mutations MUST disable their submit control while pending and surfaces MUST use the DESIGN.md system (surface cards, #15803D primary, amber pending, red error-only).

#### Scenarios
- Given a save in flight, When the user views the submit button, Then it shows a pending state and further clicks are ignored (no duplicate recipes).
- Given a save fails with a network error, Then an error banner with retry appears and entered data is preserved.
