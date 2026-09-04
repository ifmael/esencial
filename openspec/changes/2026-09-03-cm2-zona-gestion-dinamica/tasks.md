# Tasks: CM2 — Dynamic Management Zone (project-site/)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~200–300 (additive, project-site/ only) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Dynamic entries: merge lib + form + FSA/download save | PR 1 (single) | `node --test project-site/entries-lib.test.js` | Open `project-site/index.html` via `file://`; add annotation, save, reload | Revert feature commits; `data.js` and app/vitest suites untouched |

## Phase 1: Foundation

- [x] 1.1 Create `project-site/entries.js` with `window.ENTRIES = []` seed (git-versioned, hand-editable)
- [x] 1.2 Modify `project-site/index.html`: load `project-site/entries.js` as classic script between `data.js` and `app.js`
- [x] 1.3 Verify spec scenario "Empty entries file": site opens via `file://`, base tree renders as before, zero console errors

## Phase 2: Core — entries-lib (strict TDD)

- [x] 2.1 RED: Create `project-site/entries-lib.test.js` with `node --test` cases for `mergeEntries`: annotation lands after existing notes, new node after existing children, file order preserved, orphan skipped silently, chained parent (entry targets earlier entry's node), first document-order match on duplicate titles
- [x] 2.2 GREEN: Create `project-site/entries-lib.js` with pure `mergeEntries(tree, entries)` (clone-on-write; never mutates input tree) + `if (typeof module !== "undefined") module.exports` guard; `node --test project-site/entries-lib.test.js` passes
- [x] 2.3 RED: Add `node --test` cases for `serializeEntries` (output reloads as `window.ENTRIES`, round-trips fixtures) and `countTitleMatches` (document-order counts)
- [x] 2.4 GREEN: Implement `serializeEntries` and `countTitleMatches` in `project-site/entries-lib.js`; tests pass
- [x] 2.5 REFACTOR: Share one document-order traversal between `mergeEntries` and `countTitleMatches`; tests stay green

## Phase 3: Integration — form + save

- [x] 3.1 Modify `project-site/index.html`: authoring form (target `<select>`, kind `<select>` from existing KINDS, text/title/status inputs, collision-warning span, Save button)
- [x] 3.2 Modify `project-site/app.js`: render `mergeEntries(TREE, ENTRIES)` instead of raw TREE
- [x] 3.3 Modify `project-site/app.js`: submit pushes entry to `ENTRIES`, re-renders immediately; show warning when `countTitleMatches(mergedTree, title) > 1` (scenario "Ambiguous target title")
- [x] 3.4 Modify `project-site/app.js`: Save uses `showOpenFilePicker({suggestedName:"entries.js"})`, caches handle per session, later saves write via `createWritable()`; without FSA, download `new Blob([serializeEntries(ENTRIES)])` as `entries.js`

## Phase 4: Verification

- [x] 4.1 Manual smoke of remaining spec scenarios: annotation under node, repeat save without prompt, reload-after-save matches pre-save render
- [x] 4.2 Confirm `project-site/data.js` (read-only) is unmodified and `git status` lists only the five intended files
- [x] 4.3 Confirm vitest app suite unaffected: `npm test` still passes (project-site excluded from its path)
