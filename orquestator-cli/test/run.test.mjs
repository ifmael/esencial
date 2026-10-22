import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { runFlow } from "../lib/run.mjs";
import { createState, save, transition } from "../lib/state.mjs";

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-run-"));
  process.env.ORQUESTATOR_HOME = dir;
});
afterEach(() => {
  delete process.env.ORQUESTATOR_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

test("run --dry-run recorre el flujo entero desde cero", () => {
  const lines = [];
  const result = runFlow("ESN-7", { dryRun: true, out: (t) => lines.push(t) });
  assert.deepEqual(result.steps, [
    "start",
    "check",
    "review",
    "ship",
    "pr-review",
  ]);
  assert.match(lines.join("\n"), /\[dry-run\] start ESN-7/);
  assert.match(lines.join("\n"), /\[dry-run\] pr-review ESN-7/);
  assert.match(lines.join("\n"), /Blocked/);
});

test("run --dry-run desde In Progress no repite start", () => {
  save("ESN-7", transition(createState("ESN-7"), "In Progress"));
  const result = runFlow("ESN-7", { dryRun: true, out: () => {} });
  assert.deepEqual(result.steps, ["check", "review", "ship", "pr-review"]);
});

test("run --dry-run desde In validation solo espera pr-review", () => {
  save(
    "ESN-7",
    transition(
      transition(createState("ESN-7"), "In Progress"),
      "In validation",
    ),
  );
  const result = runFlow("ESN-7", { dryRun: true, out: () => {} });
  assert.deepEqual(result.steps, ["pr-review"]);
});
