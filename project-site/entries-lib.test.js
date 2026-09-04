// node --test project-site/entries-lib.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mergeEntries, serializeEntries, countTitleMatches } = require("./entries-lib.js");

// Fixture: base tree with two siblings; first has one note and two children.
const base = () => ({
  title: "Root",
  notes: [{ kind: "nota", text: "root note" }],
  children: [
    {
      title: "Alpha",
      notes: [{ kind: "decidido", text: "a1" }],
      children: [
        { title: "A-child", notes: [{ kind: "nota", text: "ac1" }] },
        { title: "Bravo" },
      ],
    },
    { title: "Alpha", notes: [{ kind: "nota", text: "dup" }] }, // duplicate title, second in doc order
  ],
});

test("annotation lands after existing notes of target node", () => {
  const out = mergeEntries(base(), [
    { parent_title: "Alpha", kind: "pendiente", text: "new note" },
  ]);
  const alpha = out.children[0];
  assert.deepEqual(alpha.notes.map((n) => n.text), ["a1", "new note"]);
});

test("new node lands after existing children of target node", () => {
  const out = mergeEntries(base(), [
    { parent_title: "Alpha", title: "New child", status: "pendiente" },
  ]);
  assert.deepEqual(out.children[0].children.map((c) => c.title), ["A-child", "Bravo", "New child"]);
  assert.equal(out.children[0].children[2].status, "pendiente");
});

test("entries apply in file order", () => {
  const out = mergeEntries(base(), [
    { parent_title: "Root", title: "first" },
    { parent_title: "Root", title: "second" },
    { parent_title: "Root", title: "third" },
  ]);
  assert.deepEqual(out.children.slice(-3).map((c) => c.title), ["first", "second", "third"]);
});

test("orphan entry is skipped silently", () => {
  const out = mergeEntries(base(), [
    { parent_title: "No existe", kind: "nota", text: "x" },
    { parent_title: "No existe", title: "y" },
  ]);
  assert.deepEqual(out, base());
});

test("entry may target a node added by an earlier entry", () => {
  const out = mergeEntries(base(), [
    { parent_title: "Root", title: "Bridge" },
    { parent_title: "Bridge", kind: "nota", text: "under bridge" },
    { parent_title: "Bridge", title: "Leaf" },
  ]);
  const bridge = out.children.find((c) => c.title === "Bridge");
  assert.deepEqual(bridge.notes.map((n) => n.text), ["under bridge"]);
  assert.deepEqual(bridge.children.map((c) => c.title), ["Leaf"]);
});

test("duplicate titles: attaches to first match in document order", () => {
  const out = mergeEntries(base(), [
    { parent_title: "Alpha", kind: "nota", text: "which one?" },
  ]);
  assert.equal(out.children[0].notes.length, 2); // first Alpha got it
  assert.equal(out.children[1].notes.length, 1); // second Alpha untouched
});

test("mergeEntries never mutates the input tree", () => {
  const tree = base();
  const before = JSON.stringify(tree);
  mergeEntries(tree, [
    { parent_title: "Alpha", kind: "nota", text: "m" },
    { parent_title: "Alpha", title: "n" },
  ]);
  assert.equal(JSON.stringify(tree), before);
});

test("serializeEntries reloads as window.ENTRIES and round-trips fixtures", () => {
  const entries = [
    { parent_title: "Alpha", kind: "nota", text: 'comillas " y \\ backslash' },
    { parent_title: "Root", title: "Nodo nuevo", status: "pendiente" },
    { parent_title: "Root", title: "Sin status" },
  ];
  const src = serializeEntries(entries);
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  assert.deepEqual(sandbox.window.ENTRIES, entries);
});

test("serializeEntries round-trips the empty list", () => {
  const src = serializeEntries([]);
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  assert.deepEqual(sandbox.window.ENTRIES, []);
});

test("countTitleMatches counts nodes in document order", () => {
  assert.equal(countTitleMatches(base(), "Alpha"), 2);
  assert.equal(countTitleMatches(base(), "Bravo"), 1);
  assert.equal(countTitleMatches(base(), "Root"), 1);
  assert.equal(countTitleMatches(base(), "No existe"), 0);
});
