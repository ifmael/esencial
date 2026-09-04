# Proposal: CM2 — Dynamic Management Zone (project-site/)

## Intent

`project-site/` renders a decision tree from a hand-edited `data.js`; the browser is read-only. Adding an annotation or entry requires editing source. We need the management zone to accept new entries and notes from the web UI and persist them to a git-versioned, hand-editable file — with no server, no build, and no content in the app deploy.

## Scope

### In Scope
- `project-site/entries.js`: new plain script defining `window.ENTRIES`, git-versioned, hand-editable
- Merge of `ENTRIES` over the read-only `TREE` in the renderer, keyed by node `title`
- Add-entry / add-annotation form in the site UI
- Save via File System Access API (one picker per session, direct writes after), fallback to blob download on `window.ENTRIES`
- Pure merge/serialize logic in `project-site/entries-lib.js` with `node --test` unit tests

### Out of Scope
- Any change to `api/`, `web/`, `wrangler.toml`, D1, `package.json`
- Servers, APIs, build steps, `fetch` of raw JSON, `localStorage`
- Mutating `data.js` (base tree stays immutable)
- Node-id migration if title collisions ever force it (documented ceiling)

## Capabilities

> Contract with the specs phase.

### New Capabilities
- `dynamic-management-entries`: authoring, merging, and persisting dynamic entries/annotations on the static management site — `ENTRIES` data shape (per spec phase: map-by-title vs flat list with `nodeTitle`), merge semantics over `TREE`, form behavior, FSA save with download fallback, hand-editability, and the documented title-uniqueness ceiling.

### Modified Capabilities
- None (no existing specs under `openspec/specs/`).

## Approach

Adopt exploration Approach 1 (locked): classic scripts loaded in order `data.js` → `entries.js` → `app.js` so it works on `file://` without CORS. `app.js` merges `window.ENTRIES` onto `TREE` and renders the form; first save calls `showOpenFilePicker()` and caches the handle for the session; later saves use `createWritable()`. Without FSA (Firefox/Safari), serialize to a Blob and trigger `<a download>` with `suggestedName: entries.js`. Merge + serialization live in `entries-lib.js` (pure, `module.exports` guard) tested with stdlib `node --test`, separate from the app's vitest suite.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `project-site/index.html` | Modified | Load `entries.js`; form + save controls |
| `project-site/app.js` | Modified | ENTRIES merge, form logic, FSA + fallback |
| `project-site/entries.js` | New | `window.ENTRIES` data file (git, hand-editable) |
| `project-site/entries-lib.js` | New | Pure merge/serialize functions |
| `project-site/entries-lib.test.js` | New | `node --test` unit tests |
| `project-site/data.js` | Unchanged | Base tree; read-only title reference |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Duplicate node `title` → wrong merge target | Med | Document ceiling; collision warning in form |
| Browser overwrite discards later hand-edits | Med | Ceiling documented; same-session pick makes window small |
| No FSA outside Chromium | High | Download fallback is a first-class requirement |
| Wrong file picked on save | Low | Clear labeling + `suggestedName` |
| Test drift vs app's vitest/strict_tdd | Low | Confirmed: stdlib `node --test`, separate command |

## Rollback Plan

Change is isolated to `project-site/` and additive. Revert the feature commits (or `git rm project-site/entries.js project-site/entries-lib.js project-site/entries-lib.test.js` and restore `index.html`/`app.js`): the site returns to reading only `data.js`, which was never mutated. `entries.js` content carries no authority — deleting it loses nothing rendered elsewhere.

## Dependencies

- None (browser-native FSA; stdlib test runner). Chromium for direct-save experience.

## Success Criteria

- [ ] Add an entry/annotation in the UI; it renders merged under the right node after reload
- [ ] Save writes `entries.js` in place via FSA; without FSA it downloads an equivalent file
- [ ] `data.js` untouched; `git status` shows only intended files
- [ ] `node --test project-site/entries-lib.test.js` passes (merge, serialize, collision behavior)
- [ ] Site still opens via `file://` with zero console errors
