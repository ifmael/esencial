import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { writeArtifact } from "../lib/artifacts.mjs";
import { inspect } from "../lib/inspect.mjs";
import { createState, save, transition } from "../lib/state.mjs";

const KEY = "ESN-7";
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-insp-"));
  process.env.ORQUESTATOR_HOME = dir;
});
afterEach(() => {
  delete process.env.ORQUESTATOR_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

test("inspect enseña estado, rama, artefactos y brief", () => {
  save(
    KEY,
    transition(
      {
        ...createState(KEY),
        branch: `${KEY}-algo`,
        issueTitle: "Arreglar algo",
        pr: { number: 9, url: "https://x/pull/9" },
      },
      "In Progress",
    ),
  );
  writeArtifact(KEY, "brief.md", "# Algo\n\nDetalle");
  writeArtifact(KEY, "checks.md", "PASS");
  const text = inspect(KEY, { main: dir, ghRun: () => "" });
  assert.match(text, /Arreglar algo/);
  assert.match(text, /ESN-7-algo/);
  assert.match(text, /pull\/9/);
  assert.match(text, /● brief\.md/);
  assert.match(text, /● checks\.md/);
  assert.match(text, /○ review\.md/);
  assert.match(text, /Detalle/);
  assert.match(text, /diff: no disponible/);
});

test("inspect de una tarea inexistente falla", () => {
  assert.throws(() => inspect("ESN-404", { main: dir }), /no existe/);
});
