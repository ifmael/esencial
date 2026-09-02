# Spec — E2 recetario

## ADDED Requirements

### Requirement: Recipe book screen
The route `/plan-recetas` MUST render the recipe book: header with title "Recetario", a search field, and a primary button "+ Nueva receta"; below, recipe cards showing thumbnail (placeholder when absent), name, and tag chips. Cards MUST be in a responsive grid on desktop and a single-column list on mobile. Tapping a card opens the recipe detail.

#### Scenarios
- Given 3 recipes exist, When `/plan-recetas` loads, Then 3 cards render with name visible and the search field focused on "/" does not steal navigation.
- Given no recipes exist, When `/plan-recetas` loads, Then an empty-state card invites creating the first recipe.
- Given the API is unreachable, When the page loads, Then an error card offers retry (no silent blank page).

### Requirement: Recipe search
The search field MUST filter the visible recipes client-side by name substring (case-insensitive) and by tag.

#### Scenarios
- Given recipes "Arroz con pollo" and "Ensalada", When the user types "arroz", Then only the matching card remains visible, without any network request.
- Given the user clears the search, When the field empties, Then all recipes reappear.

### Requirement: Recipe detail
Opening a recipe MUST show: photo (or placeholder), name, description, servings, ingredients as a checklist with quantity + unit, numbered steps in order, and material chips. A pencil action MUST open the editor in edit mode.

#### Scenarios
- Given a recipe with 3 ordered ingredients and 4 numbered steps, When opened, Then they render in E1 insertion order and numbering 1..4.
- Given the user taps the pencil, When the editor opens, Then all fields are pre-filled and changes only persist on explicit save.

### Requirement: Recipe editor (create + edit)
The "+ Nueva receta" action MUST open the editor form with: name (required), description, servings (number ≥ 1), dynamic ingredient rows (food, quantity, unit; add/remove rows), ordered steps (add/remove/reorder), material chips (add/remove), and free tags. Save MUST POST to `/api/recipes` (create) or PUT `/api/recipes/{id}` (edit) and show a field-level error from the 400 envelope on invalid input. Cancel MUST discard all changes without any API call.

#### Scenarios
- Given the editor opened for create, When saved with name "Tortilla" and 2 ingredient rows, Then the API receives a valid payload, the book list shows the new card, and the form closes.
- Given the name is empty, When saved, Then a field error "name" is shown next to the field and no API call is made.
- Given edit mode changed 1 step and the user cancels, When reopening the recipe, Then the original data is intact.

### Requirement: Deletion
A recipe detail MUST offer a delete action with a confirmation step. On confirm, DELETE `/api/recipes/{id}` is called and the card disappears from the book.

#### Scenarios
- Given a recipe open in detail, When the user confirms deletion, Then the card is removed from the list and a brief success state is shown.
- Given the user cancels the confirmation, When dismissing, Then nothing changes.

### Requirement: Loading and interaction states
All mutations MUST disable their submit control while pending and surfaces MUST use the DESIGN.md system (surface cards, #15803D primary, amber pending, red error-only).

#### Scenarios
- Given a save in flight, When the user views the submit button, Then it shows a pending state and further clicks are ignored (no duplicate recipes).
- Given a save fails with a network error, Then an error banner with retry appears and entered data is preserved.
