# Design: CM2 — Dynamic Management Zone (project-site/)

## Technical Approach

Keep `project-site/` zero-build and zero-server. `app.js` renders `window.TREE` recursively; we insert a pure overlay: `window.ENTRIES` (new flat array in `entries.js`) merges onto `TREE` at render time, never mutating `data.js`. Authoring and persistence (File System Access API with download fallback) live in `app.js`; merge/serialize logic lives in `entries-lib.js`, testable with stdlib `node --test`. Maps 1:1 to the `dynamic-management-entries` spec.

## Architecture Decisions

### Decision: ENTRIES shape — flat array with `parent_title`

**Choice**: `window.ENTRIES = [{ parent_title, kind, text } | { parent_title, title, status? }]`, applied in file order.
**Alternatives considered**: map keyed by node title; per-node arrays nested in a second tree.
**Rationale**: flat list is hand-editable (append one object), preserves authoring order, lets `parent_title` reference a node added by an earlier entry, and distinguishes annotations vs. new nodes by presence of `title`/`kind`. Locked by spec.

### Decision: classic scripts in load order, no fetch/modules

**Choice**: `index.html` loads `data.js` → `entries.js` → `app.js` as plain scripts; `app.js` renders `mergeEntries(TREE, ENTRIES)` instead of raw `TREE`.
**Alternatives considered**: `fetch("entries.json")`; ES modules.
**Rationale**: both break on `file://` (CORS / module scheme restrictions). Script tags are the existing `data.js` pattern.

### Decision: pure merge in `entries-lib.js` with dual-export guard

**Choice**: `mergeEntries` returns a new tree (clone-on-write of touched paths); orphans skipped silently; annotations appended after existing `notes`, new nodes after existing `children`; title match = first node in document order. File ends with `if (typeof module !== "undefined") module.exports = {...}`; browser sees globals.
**Alternatives considered**: mutating `TREE` in place; merge inside `app.js`.
**Rationale**: purity makes the tricky branches (orphans, ordering, chained parents, first-match) testable without a DOM, and keeps vitest (app suite) out of project-site's path — confirmed workaround for `strict_tdd`.

### Decision: FSA first save, cached handle; Blob download fallback

**Choice**: save button → `showOpenFilePicker({suggestedName:"entries.js"})`, handle cached per session, later saves `createWritable()` silently. No FSA → `new Blob([serializeEntries(ENTRIES)])` + `<a download="entries.js">`.
**Alternatives considered**: clipboard copy; server endpoint.
**Rationale**: endpoint violates the no-server constraint; clipboard is worse than the already-mandated download fallback. Overwrite-discards-hand-edits is the documented ceiling.

### Decision: collision warning in form, first-match on merge

**Choice**: title `<select>` populated from merged tree titles; `countTitleMatches(tree,title) > 1` shows a warning next to the form. Merge still attaches to the first document-order match.
**Alternatives considered**: node-id migration (out of scope); refusing ambiguous saves.
**Rationale**: makes the documented ceiling observable without blocking the single-user workflow.

## Data Flow

```
data.js (TREE, immutable) ─┐
                           ├─ mergeEntries() ─→ renderNode() ─→ <details> tree
entries.js (ENTRIES, flat)─┘        ▲                               │
                                    │ immediate re-render           ▼
                     form (app.js) ─┴── push entry            save: FSA handle
                                                    └─ or ─→ Blob download entries.js
```

Save serializes the in-memory `ENTRIES` array only (not the tree), so `data.js` is never at risk. Reload re-runs merge → identical render.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `project-site/entries.js` | Create | `window.ENTRIES = []` seed; git-versioned, hand-editable |
| `project-site/entries-lib.js` | Create | Pure `mergeEntries`, `serializeEntries`, `countTitleMatches` + export guard |
| `project-site/entries-lib.test.js` | Create | `node --test` unit tests |
| `project-site/index.html` | Modify | `<script src="entries.js">` before `app.js`; form markup + save button |
| `project-site/app.js` | Modify | render merged tree; form logic; FSA + download glue |
| `project-site/data.js` | None | Untouched (read-only title reference) |

## Interfaces / Contracts

```js
// entries.js — entry is annotation OR new node
{ parent_title: string, kind: KINDS, text: string }
{ parent_title: string, title: string, status?: "decidido"|"descartado"|"pendiente"|"activo" }

// entries-lib.js — pure, no DOM
mergeEntries(tree, entries) -> newTree   // file order; orphans skipped; first-match
serializeEntries(entries) -> string      // "window.ENTRIES = [...];\n"
countTitleMatches(tree, title) -> number // document order
```

Form: target select (merged titles) + kind select (existing `KINDS`) + text/title/status inputs; submit pushes to `ENTRIES` and re-renders immediately.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | merge ordering, chained parents, orphan skip, first-match collision, serialize round-trip, `countTitleMatches` | `node --test project-site/entries-lib.test.js` (stdlib, inline fixtures) |
| Integration | — | none: no server, no build |
| E2E | file:// load with zero console errors; save/download produces loadable file | manual smoke per spec scenarios (no browser harness in project-site) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Browser-only static scripts; renderer uses `textContent` throughout (existing pattern, kept for entry text), so authored content cannot inject HTML.

## Migration / Rollout

No migration required. Additive cutover: commit `entries.js` seed with `[]` — site renders identically to today. Rollback = revert feature commits (proposal's plan). SQLite migration notes: N/A (no database touched).

## Open Questions

- None blocking. Form placement (legend vs. header) is cosmetic; pick during apply.
