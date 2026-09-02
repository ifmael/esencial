# Tasks — E2 recetario

## 1. Foundation (TDD)
- [ ] 1.1 RED+GREEN: `photo_path` additive migration (guarded ALTER, idempotent, data preserved)
- [ ] 1.2 RED+GREEN: `useRecipes` hook — list/create/update/delete with pending + error flags (mocked fetch)
- [ ] 1.3 RED+GREEN: search filter helper (name substring case-insensitive + tag match)

## 2. Recipe book screen (TDD)
- [ ] 2.1 RED+GREEN: book renders cards (name, tags, placeholder thumbnail) from hook data
- [ ] 2.2 RED+GREEN: empty state and API-error-with-retry state
- [ ] 2.3 RED+GREEN: search filters cards client-side; clearing restores all
- [ ] 2.4 Responsive layout per DESIGN.md (grid desktop / single column mobile) — visual check at evaluation

## 3. Recipe detail (TDD)
- [ ] 3.1 RED+GREEN: detail route `/plan-recetas/[id]` renders ordered ingredients/steps, materials, servings
- [ ] 3.2 RED+GREEN: delete with confirmation — removes card; cancel keeps everything

## 4. Recipe editor (TDD)
- [ ] 4.1 RED+GREEN: create flow — valid POST, card appears, modal closes
- [ ] 4.2 RED+GREEN: validation — empty name shows field error, zero API calls
- [ ] 4.3 RED+GREEN: edit flow — pre-filled, PUT on save, cancel leaves data intact
- [ ] 4.4 RED+GREEN: dynamic rows — add/remove ingredient rows, add/remove/reorder steps, material chips, tags

## 5. Verify & close
- [ ] 5.1 Full `npm test` + `npm run build` green
- [ ] 5.2 Browser E2E smoke (prod build): create → search → open → edit → delete journey
- [ ] 5.3 Update project-site tree (E2 done), archive change, joint evaluation
