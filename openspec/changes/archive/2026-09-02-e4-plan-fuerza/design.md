# Design — E4 plan fuerza

## Decisions

### D1: Client-only feature over the existing E1/CM1 API
Zero server changes. `/plan-fuerza`, `/ejercicios`, and `/ejercicios/:id` are React route components in `web/src/routes/`, fed by two typed fetch hooks in `web/src/lib/` (`useTemplates`, `useExercises`) that follow the E2 `useRecipes` pattern: list + mutate + `pending`/`error` flags against `GET/POST/PUT/DELETE /api/templates` and `/api/exercises`. The personal dataset is tiny — both hooks load the full list once and refetch after each mutation; no caching layer, no optimistic writes.

### D2: Template editor = local draft, one atomic PUT on save
`template_exercises` has no per-row endpoint: `PUT /api/templates/:id` replaces ALL ordered entries in one D1 batch (routes/templates.ts). So the editor keeps a local `entries[]` draft (add/remove/reorder/target edits mutate the draft only) and flushes exactly one PUT on save. Cancel = discard draft, zero API calls. Positions are renumbered 0..n-1 from draft order at save time. Rationale: matches the "cancel leaves data intact" contract E2 established for the recipe editor and exploits the server-side atomicity instead of fighting it.

### D3: Reorder with ↑/↓ buttons; drag deferred as an open decision
The wireframe asks for a drag handle. Arrow buttons are chosen for MVP: keyboard-accessible, work on touch, and testable in jsdom without a drag-and-drop dependency (none installed; adding one for four list operations is YAGNI). The draft reorder helper is a pure `moveItem(list, from, to)` so a later HTML5-drag overlay reuses it. **Open for the user:** ship arrows now and add drag on top later, or invest in a drag library in this epic.

### D4: "Ver técnica" = plain link to any valid URL
`api-validation.ts` validates `technique_url` with `z.url()` — the schema never says YouTube. The UI therefore treats it as a generic external link: renders a "Ver técnica" button (opens `target="_blank" rel="noopener"`) only when the field is non-empty; the field label suggests "URL de YouTube" but any URL saves. No iframes/embeds (extra attack surface, D1 has no video needs). **Open for the user:** free URL (this design) vs. client-side YouTube-only pattern validation.

### D5: Duplicate template and rotation chips are client-derived
No `POST /api/templates/:id/duplicate` endpoint exists (none should — E1 routes are frozen): duplicate = read the template, `POST /api/templates` with a new name ("A — Empupe (copia)") and the same exercise entries. Rotation chips (A→B→C) render `GET /api/templates` order (`rotation_index, name`) and scroll to the matching card; editing rotation happens in the template editor via a numeric `rotation_index` input (PUT preserves it when absent — COALESCE parity, routes/templates.ts:81).

### D6: In-use errors surface verbatim from the envelope
Deleting an exercise referenced by a template hits `FOREIGN KEY constraint failed` (template_exercises.exercise_id is RESTRICT) → API returns 400 `{error: "References a missing or in-use record", field: "reference"}`; duplicate names hit UNIQUE → 400 `{error: "Already exists", field: "name"}`. UI policy (same as E2): show the server message inline next to the failing control, never swallow it, never retry automatically.

### D7: TDD for logic, testing-library for behavior
Unit: `moveItem`, draft-entry reducer (add/remove/reorder/target edit), template-payload builder (draft → `templateSchema` body), duplicate-name generator. Component (testing-library + mocked fetch, per `web/tests/shell.test.tsx` conventions): render states, editor save/cancel contract, picker filtering, delete confirmations, field-error surfacing. Visual styling checked manually against DESIGN.md tokens at evaluation.

## Migration notes

None. No schema, no API, no `wrangler` changes — D1 tables `exercises`, `exercise_tags`, `session_templates`, `template_exercises` already exist per `api/schema.sql`. The only existing-code touchpoint is `web/src/routes/plan-fuerza.tsx` (stub replaced) and the stub-text assertion in `web/tests/shell.test.tsx:27` (updated in the same task).
