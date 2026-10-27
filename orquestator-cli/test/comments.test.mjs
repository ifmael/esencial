import assert from "node:assert/strict";
import { test } from "node:test";

import { AI_MARKER, markComment } from "../lib/comments.mjs";

test("markComment pone una cabecera visible y no se duplica", () => {
  const marked = markComment("Hola");
  assert.match(marked, new RegExp(AI_MARKER));
  assert.match(marked, /Orquestator \(IA\)/);
  assert.equal(markComment(marked), marked.trimEnd());
});
