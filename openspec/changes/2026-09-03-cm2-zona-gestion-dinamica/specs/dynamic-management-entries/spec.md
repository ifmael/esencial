# Dynamic Management Entries Specification

## Purpose

Let the static management site (`project-site/`) accept new entries and annotations from the browser, merge them onto the read-only base tree at render time, and persist them to a plain, git-versioned, hand-editable data file — no server, no build step.

## Requirements

### Requirement: Plain ENTRIES data file

Dynamic content MUST live in a separate `entries.js` defining `window.ENTRIES` as a flat array. Each entry MUST carry `parent_title` (title of the node it augments) and MUST be either an annotation (`kind` from the site's note kinds, plus `text`) or a new node (`title`, optional `status`). The file MUST be git-versioned, hand-editable as plain JavaScript, and loaded before the app script so the site works opened directly via `file://`.

#### Scenario: Empty entries file

- GIVEN `entries.js` defines an empty array
- WHEN the site loads from disk without a web server
- THEN the base tree MUST render exactly as before, with zero console errors

### Requirement: Non-destructive merge onto the base tree

The renderer MUST merge `ENTRIES` onto the base tree by matching `parent_title` against node titles. The base tree file MUST NEVER be modified. Annotations MUST appear after a node's existing notes; new nodes after its existing children. Entries MUST apply in file order, and `parent_title` MAY reference a node added by an earlier entry.

#### Scenario: Annotation under an existing node

- GIVEN an annotation entry whose `parent_title` matches a rendered node
- WHEN the site renders
- THEN the annotation MUST appear among that node's notes with its kind badge

#### Scenario: Orphan entry

- GIVEN an entry whose `parent_title` matches no node
- WHEN the site renders
- THEN the entry MUST be skipped and the site MUST render without errors

### Requirement: Authoring form

The site MUST offer a form to author annotations and new nodes, with the target node chosen from the titles currently rendered. Items added through the form MUST render merged immediately, before any save.

#### Scenario: Add an annotation

- GIVEN the form targets a node and the author submits a kind and text
- WHEN the entry is added
- THEN the annotation MUST appear under that node and be included in `ENTRIES`

### Requirement: Persist via File System Access API

Where the browser supports the File System Access API, the first save MUST ask the author to pick a file (proposed name `entries.js`); later saves in the same session MUST write it directly, without another prompt. Reloading after save MUST render exactly what was visible before saving.

#### Scenario: Repeat save reuses the picked file

- GIVEN one save has already succeeded this session
- WHEN the author saves again
- THEN `entries.js` MUST be overwritten with no user interaction

### Requirement: Download fallback without FSA

Where the File System Access API is unavailable, save MUST download a file named `entries.js` whose content is equivalent to what FSA would have written, for the author to place in the site folder. Unsaved entries MUST NOT be lost by the fallback.

#### Scenario: Save on a non-Chromium browser

- GIVEN a browser without FSA support and pending entries
- WHEN the author saves
- THEN a download named `entries.js` MUST start containing those entries

### Requirement: Title-collision ceiling

Node titles are the merge keys and are assumed unique; this ceiling is observable behavior, not a hidden assumption. When a chosen `parent_title` matches more than one node, the form MUST warn the author, and the entry MUST attach only to the first matching node in document order. No node-identifier migration is in scope.

#### Scenario: Ambiguous target title

- GIVEN two nodes share the same title
- WHEN the author picks that title in the form
- THEN a collision warning MUST appear
- AND saving MUST attach the entry to the first match only
