# Spec — E4 plan fuerza

## ADDED Requirements

### Requirement: Strength plan screen
The route `/plan-fuerza` MUST render the strength plan: header "Plan fuerza", rotation chips derived from `GET /api/templates` order (one per template, first chip = lowest `rotation_index`), one card per session template titled with its name (e.g. "A — Empuje"), and a primary button "+ Nueva plantilla" at the bottom. Tapping a chip MUST scroll to (and expand) that template's card. Cards MUST be full-width on mobile and a multi-column layout on desktop.

#### Scenarios
- Given templates A (rotation 0), B (rotation 1), C (rotation 2) exist, When `/plan-fuerza` loads, Then chips render in A→B→C order and 3 template cards render.
- Given the user taps chip "C", When the tap completes, Then card "C — Piernas" is scrolled into view and expanded.
- Given no templates exist, When the page loads, Then an empty state invites creating the first template and "+ Nueva plantilla" remains visible.
- Given the API is unreachable, When the page loads, Then an error card offers retry (no silent blank page).

### Requirement: Expandable template cards with exercise rows
Each template card MUST collapse/expand on header tap. Expanded, it lists its exercises in `position` order, each row showing the exercise name and its target series (e.g. "3×8–12" from `target_sets` / `target_reps_min` / `target_reps_max`; rows without targets show only the name). Tapping a row MUST open `/ejercicios/{exerciseId}`.

#### Scenarios
- Given template "A — Empuje" with entries [Press banca (3×8), Remo (null targets)] in position order, When the card is expanded, Then rows render in that order, the first showing "3×8", the second showing only "Remo".
- Given a collapsed card, When the user taps its header, Then the exercise list appears without any network request.
- Given the user taps row "Press banca" (id 7), Then the app navigates to `/ejercicios/7`.

### Requirement: Template editor (create + edit)
"Editar" on a card MUST open the template editor with: name (required), `rotation_index` (integer ≥ 0), and the ordered entry draft. The "+ Nueva plantilla" button opens the same editor empty. Save MUST send one `PUT /api/templates/{id}` (edit) or `POST /api/templates` (create) with entries renumbered 0..n−1 in draft order; each entry MAY carry `target_sets`, `target_reps_min`, `target_reps_max`. Cancel MUST discard the draft without any API call. Invalid saves MUST show the `{error, field?}` message from the 400 envelope inline.

#### Scenarios
- Given the editor for template A, When the user renames it "A — Empuje y núcleo" and saves, Then `PUT /api/templates/{id}` carries the new name and the unchanged entries, and the card shows the new name.
- Given create mode with name "D — Movilidad" and 2 entries, When saved, Then the API receives a valid payload and the new card appears.
- Given the name is empty, When saved, Then a field error shows next to the name and no API call is made.
- Given edits to entries and the user cancels, When reopening the template, Then the stored data is intact.
- Given the user saves a name already used by another template, Then the API 400 `{error:"Already exists", field:"name"}` is shown inline and the draft is preserved.

### Requirement: Entry management inside the editor
The editor MUST support adding exercises via a picker, removing entries, reordering entries, and editing per-entry targets (sets, reps min, reps max — each an optional integer ≥ 1).

#### Scenarios
- Given the picker is open with catalog [Sentadilla, Peso muerto], When the user types "sent", Then only "Sentadilla" remains (client-side, case-insensitive, no network request); tapping it appends it to the draft.
- Given a draft of 3 entries, When the user removes entry 2, Then the draft shows the other two in relative order.
- Given a draft of 3 entries, When the user presses the down arrow on entry 1 then saves, Then the PUT payload has that exercise at position 1 (0-indexed) and the displaced exercise at position 0, with no duplicates or gaps.
- Given an entry, When the user sets 4 sets / min 6 / max 8 and saves, Then the stored template (via `GET /api/templates/{id}`) returns those targets for that entry.

### Requirement: Duplicate template
Each card's actions MUST include "Duplicar". Duplicating MUST create a new template via `POST /api/templates` with the source's entries (same order and targets) and a non-conflicting name derived from the source (e.g. suffix " (copia)", incremented on collision).

#### Scenarios
- Given template "B — Tirón" with 3 entries, When duplicated, Then a fourth card appears whose expanded list matches the source order and targets.
- Given the derived duplicate name collides with an existing template, Then the client picks the next free suffix before the create call (no extra API round-trips beyond the create itself).

### Requirement: Exercise catalog list
The route `/ejercicios` MUST render the catalog: header "Ejercicios", a search field, a "+ Nuevo ejercicio" button, and one card per exercise from `GET /api/exercises` in API order (name, case-insensitive), each showing name and tag chips. Search MUST filter client-side by name substring and tag. Tapping a card opens `/ejercicios/{id}`.

#### Scenarios
- Given exercises "Press banca" (tags pecho, tríceps) and "Sentadilla" (tag pierna), When `/ejercicios` loads, Then 2 cards render with their chips.
- Given the user types "pecho", When the field updates, Then only "Press banca" remains, with no network request.
- Given the catalog is empty, Then an empty state invites creating the first exercise.

### Requirement: Exercise detail
The route `/ejercicios/:id` MUST show: back control, name, description, tag chips, setup cues, a "Ver técnica" button when `techniqueUrl` is non-empty, a primary "Añadir a plantilla" action, and pencil/delete actions. Unknown or deleted ids MUST show a not-found state, never a crash.

#### Scenarios
- Given exercise 7 with `techniqueUrl` set, When opened, Then "Ver técnica" renders as a link with `target="_blank" rel="noopener"` pointing at that URL.
- Given exercise 7 has no `techniqueUrl`, Then the "Ver técnica" control is absent.
- Given the user navigates to `/ejercicios/9999` (missing), Then a not-found card with a back link renders.

### Requirement: Add exercise to template from detail
"Añadir a plantilla" MUST open a picker listing the user's templates; choosing one MUST append the exercise at the end of that template's entries via `PUT /api/templates/{id}` (preserving existing entries, their targets, and the stored `rotation_index`). Success MUST be acknowledged and MUST NOT navigate away.

#### Scenarios
- Given exercise "Remo" and template "A — Empuje" with 2 entries, When the user picks it, Then the PUT appends Remo as position 2, A keeps its first two entries in order, and a brief success state appears.
- Given no templates exist, When the user taps "Añadir a plantilla", Then the picker shows an empty state linking to `/plan-fuerza` and no API call is made.

### Requirement: Exercise editor (create + edit)
"+ Nuevo ejercicio" and the detail pencil MUST open a form with: name (required), description, setup cues, technique URL (optional; must be a valid URL or empty), and tags (at least one, free-text chips). Save MUST `POST /api/exercises` (create) or `PUT /api/exercises/{id}` (edit); invalid saves MUST surface the 400 envelope's `{error, field}` inline. Cancel MUST discard without any API call.

#### Scenarios
- Given create mode with name "Hip thrust", tags [glúteo] and a YouTube URL, When saved, Then `POST /api/exercises` succeeds (201) and the detail route shows the saved data.
- Given tags are empty, When saved, Then the client blocks with an inline error and no API call (server contract: at least one tag).
- Given a technique URL that is not a valid URL, Then the 400 `{error, field:"technique_url"}` message renders next to that field and the draft is preserved.

### Requirement: Deletion with confirmation
The exercise detail MUST offer delete with confirmation, then `DELETE /api/exercises/{id}` and return to the catalog with the card gone. Template cards MUST offer delete with confirmation, then `DELETE /api/templates/{id}` and remove the card. When the API rejects because the record is referenced (400 `{error:"References a missing or in-use record", field:"reference"}`), the UI MUST show that message and keep the item.

#### Scenarios
- Given "Peso muerto" is in no template, When the user confirms deletion, Then 204 is received and the card disappears from `/ejercicios`.
- Given "Sentadilla" is used by template C, When the user confirms deletion, Then the in-use error message is shown and the exercise remains in the catalog.
- Given the user cancels either confirmation, Then nothing changes.

### Requirement: Loading and interaction states
All mutations MUST disable their submit control while pending and re-enable on completion or failure. Error surfaces MUST reuse the existing envelope-driven pattern (inline field errors; retry banners for load failures) and the DESIGN.md token system (primary #15803D, amber pending, red error-only, 44px touch targets on mobile).

#### Scenarios
- Given a template save in flight, Then the save button shows a pending state and further clicks are ignored (no duplicate templates).
- Given a PUT fails with a network error, Then an error banner appears and the draft entries are preserved for retry.
