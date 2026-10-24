import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

test("run --dry-run recorre el flujo entero desde cero", async () => {
  const lines = [];
  const result = await runFlow("ESN-7", {
    dryRun: true,
    out: (t) => lines.push(t),
  });
  assert.deepEqual(result.steps, [
    "start",
    "implement",
    "check",
    "review",
    "pr",
    "preview",
    "ship",
    "pr-review",
  ]);
  assert.match(lines.join("\n"), /\[dry-run\] start ESN-7/);
  assert.match(lines.join("\n"), /\[dry-run\] pr-review ESN-7/);
  assert.match(lines.join("\n"), /Blocked/);
});

test("run --dry-run desde In Progress no repite start", async () => {
  save("ESN-7", transition(createState("ESN-7"), "In Progress"));
  const result = await runFlow("ESN-7", { dryRun: true, out: () => {} });
  assert.deepEqual(result.steps, [
    "implement",
    "check",
    "review",
    "pr",
    "preview",
    "ship",
    "pr-review",
  ]);
});

test("run --dry-run desde In validation solo espera pr-review", async () => {
  save(
    "ESN-7",
    transition(
      transition(createState("ESN-7"), "In Progress"),
      "In validation",
    ),
  );
  const result = await runFlow("ESN-7", { dryRun: true, out: () => {} });
  assert.deepEqual(result.steps, ["pr-review"]);
});

test("run --dry-run no toca el clon de juguete", async () => {
  const repo = path.join(dir, "ESN-7", "repo");
  fs.mkdirSync(repo, { recursive: true });
  execFileSync("git", ["init", "-q", repo]);
  fs.writeFileSync(path.join(repo, "a.txt"), "a");
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", [
    "-c",
    "user.email=t@test",
    "-c",
    "user.name=T",
    "-C",
    repo,
    "commit",
    "-q",
    "-m",
    "a",
  ]);
  const head = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const before = execFileSync("git", ["-C", repo, "for-each-ref"], {
    encoding: "utf8",
  });
  const branch = execFileSync("git", ["-C", repo, "branch", "--show-current"], {
    encoding: "utf8",
  }).trim();
  save("ESN-7", transition({ ...createState("ESN-7"), branch }, "In Progress"));
  const lines = [];
  await runFlow("ESN-7", { dryRun: true, out: (t) => lines.push(t) });
  assert.match(lines.join("\n"), new RegExp(`clon: en ${branch}`));
  assert.equal(
    execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    head,
  );
  assert.equal(
    execFileSync("git", ["-C", repo, "for-each-ref"], { encoding: "utf8" }),
    before,
  );
});

function fakeSteps(overrides = {}) {
  const names = [
    "implement",
    "check",
    "review",
    "pr",
    "preview",
    "ship",
    "pr-review",
  ];
  const calls = [];
  const steps = {};
  for (const name of names) {
    steps[name] = async () => {
      calls.push(name);
      return overrides[name] ?? {};
    };
  }
  return { steps, calls };
}

test("run real encadena las fases y para en la primera que no pasa", async () => {
  save(
    "ESN-7",
    transition({ ...createState("ESN-7"), branch: "ESN-7-x" }, "In Progress"),
  );
  const { steps, calls } = fakeSteps({
    check: { stop: "check", hint: "orquestator fix ESN-7 --from checks" },
  });
  const lines = [];
  const result = await runFlow("ESN-7", {
    steps,
    out: (t) => lines.push(t),
  });
  assert.equal(result.ok, false);
  assert.equal(result.stop, "check");
  assert.deepEqual(calls, ["implement", "check"]);
  assert.match(lines.join("\n"), /orquestator fix ESN-7/);
});

test("run real completa la cadena y deja In validation al pasar ship", async () => {
  save(
    "ESN-7",
    transition({ ...createState("ESN-7"), branch: "ESN-7-x" }, "In Progress"),
  );
  const { steps, calls } = fakeSteps();
  const result = await runFlow("ESN-7", { steps, out: () => {} });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    "implement",
    "check",
    "review",
    "pr",
    "preview",
    "ship",
    "pr-review",
  ]);
});

test("run real no arranca una tarea cerrada", async () => {
  save(
    "ESN-7",
    transition(
      transition(
        transition(createState("ESN-7"), "In Progress"),
        "In validation",
      ),
      "Done",
    ),
  );
  const { steps } = fakeSteps();
  await assert.rejects(
    runFlow("ESN-7", { steps, out: () => {} }),
    /no continúa/,
  );
});
