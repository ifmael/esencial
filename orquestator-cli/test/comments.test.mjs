import assert from "node:assert/strict";
import { test } from "node:test";

import { AI_MARKER, checksSummary, markComment } from "../lib/comments.mjs";

test("checksSummary quita el ruido y conserva resultado y comando", () => {
  const summary = checksSummary(`# Checks
Fecha: 2026-10-27T08:00:00Z
Resultado: PASS

$ pnpm lint && pnpm test
Not implemented: Window's scrollTo() method
`);
  assert.match(summary, /Resultado: PASS/);
  assert.match(summary, /pnpm lint && pnpm test/);
  assert.doesNotMatch(summary, /scrollTo/);
});

test("markComment pone una cabecera visible y no se duplica", () => {
  const marked = markComment("Hola");
  assert.match(marked, new RegExp(AI_MARKER));
  assert.match(marked, /Orquestator \(IA\)/);
  assert.equal(markComment(marked), marked.trimEnd());
});
