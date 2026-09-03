# Tasks — E4 plan fuerza

> Stack: `web/` React 19 + Vite + Tailwind 4 SPA, fetch against the existing D1/Hono API (`/api/*`). No server, schema, or `wrangler` changes (design "Migration notes": none). Strict TDD: every behavior task is RED (failing test first) → GREEN. Test command: `pnpm --filter web test` (vitest + testing-library, mocked `fetch`).

## 1. Foundation: hooks + pure logic (TDD)

- [x] 1.1 RED+GREEN: `web/src/lib/exercises.ts` — `useExercises` hook (list from `GET /api/exercises`, create/update/delete, `pending`/`error` flags, refetch-after-mutate; mocked fetch, E2 `useRecipes` pattern)
- [x] 1.2 RED+GREEN: `web/src/lib/templates.ts` — `useTemplates` hook (list from `GET /api/templates` in API order, create/update/delete, same flags)
- [x] 1.3 RED+GREEN: draft-entry reducer in `web/src/lib/template-draft.ts` — `addEntry`, `removeEntry`, `moveItem(list, from, to)`, `setTargets`; invariants: stable row keys, positions contiguous 0..n−1 at build time
- [x] 1.4 RED+GREEN: `buildTemplatePayload(draft)` — entries renumbered 0..n−1, targets nullable per `templateSchema`; plus `nextCopyName(source, existing[])` collision-incrementing duplicate name

## 2. Strength plan screen (TDD)

- [x] 2.1 RED+GREEN: `/plan-fuerza` renders header "Plan fuerza", rotation chips in API order, one card per template (replaces the E0 stub; update the stub-text assertion in `web/tests/shell.test.tsx:27` in this same task)
- [x] 2.2 RED+GREEN: empty state (no templates → invite + "+ Nueva plantilla" visible) and API-error-with-retry state
- [x] 2.3 RED+GREEN: expand/collapse card (list toggle with zero network calls); chip tap scrolls to and expands its card
- [x] 2.4 RED+GREEN: exercise rows in position order, target string "3×8–12" (sets × min–max; partial/absent targets degrade to name-only); row tap navigates to `/ejercicios/:exerciseId`
- [x] 2.5 Responsive layout per DESIGN.md (single column mobile / multi-column desktop, 44px touch targets) — visual check at evaluation

## 3. Template editor (TDD)

- [x] 3.1 RED+GREEN: create flow — "+ Nueva plantilla" opens editor; valid save → single `POST /api/templates` (201), card appears, editor closes
- [x] 3.2 RED+GREEN: edit flow — pre-filled from the template (name, rotation_index, ordered entries), save → single `PUT /api/templates/:id`; cancel → draft discarded, zero API calls, reopening shows stored data
- [x] 3.3 RED+GREEN: validation + server errors — empty name blocks submit with inline field error and no call; API 400 `{error:"Already exists", field:"name"}` shown inline with draft preserved
- [x] 3.4 RED+GREEN: exercise picker inside editor — client-side search (name substring + tag, case-insensitive, no network), tap appends entry at end
- [x] 3.5 RED+GREEN: row controls — remove, ↑/↓ reorder (payload assertion: displaced positions swapped, no gaps/dupes), per-entry target editors (sets / reps min / reps max)
- [x] 3.6 RED+GREEN: "Duplicar" on card → `POST /api/templates` with source entries/targets and non-colliding derived name; new card matches source order
- [x] 3.7 RED+GREEN: template delete with confirmation → `DELETE /api/templates/:id`, card removed; cancel changes nothing

## 4. Exercise catalog (TDD)

- [x] 4.1 RED+GREEN: `/ejercicios` list — header "Ejercicios", cards with name + tag chips in API order; empty state
- [x] 4.2 RED+GREEN: client-side search filters by name and tag; clearing restores all (zero network)
- [x] 4.3 RED+GREEN: `/ejercicios/:id` detail — back, name, description, tag chips, setup cues; "Ver técnica" anchor (`target="_blank" rel="noopener"`) only when `techniqueUrl` present; 404/unknown id → not-found card

## 5. Add-to-template + exercise editor (TDD)

- [x] 5.1 RED+GREEN: "Añadir a plantilla" picker — lists templates from `useTemplates`; choosing → one `PUT /api/templates/:id` appending the exercise last, preserving existing entries and stored rotation_index; brief success state, no navigation; no templates → picker empty-state links to `/plan-fuerza`, no call
- [x] 5.2 RED+GREEN: exercise editor create — name required (client block), tags ≥ 1 (client block), technique URL optional; valid save → `POST /api/exercises` (201), detail shows saved data
- [x] 5.3 RED+GREEN: exercise editor edit + server errors — pre-filled, `PUT /api/exercises/:id` on save, cancel intact; invalid `technique_url` → 400 `{error, field}` next to the field with draft preserved
- [x] 5.4 RED+GREEN: exercise delete with confirmation — 204 → back to catalog, card gone; in-use 400 `{error:"References a missing or in-use record"}` → message shown, item stays; cancel changes nothing

## 6. Shared states + wiring

- [x] 6.1 RED+GREEN: pending contract on all submits — control disabled while in flight, second click ignored (exactly one POST/PUT observed); network-error banner keeps draft
- [x] 6.2 Register new routes in `web/src/app.tsx` (`/ejercicios`, `/ejercicios/:id`); verify deep links serve via the existing SPA fallback (`api/src/index.ts` notFound → ASSETS) — smoke only, no API edit

## 7. Verify & close

- [x] 7.1 `pnpm --filter web test` + `pnpm run build` green (project-wide suite run by the main agent after sibling epics land)
- [ ] 7.2 Browser smoke (dev server): create template → add exercises → reorder → duplicate → open exercise → edit → add-to-template → delete in-use error journey
- [ ] 7.3 Update project-site tree (E4 done), archive change, joint evaluation
