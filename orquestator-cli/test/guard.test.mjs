import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  analyze,
  approveState,
  diffFiles,
  diffPatch,
  guardTask,
  parsePaths,
} from "../lib/guard.mjs";
import { createState, save, transition } from "../lib/state.mjs";

const KEY = "ESN-7";
const RULES = `# prueba\nAGENTS.md\norquestator-cli/\n!.github/workflows/\npackage.json\n`;

let dir;
let main;
let origin;
let task;
let mirror;
let base;

function gitIn(cwd, ...args) {
  return execFileSync(
    "git",
    ["-c", "user.email=t@test", "-c", "user.name=Test", ...args],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

function commit(cwd, file, text) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), text);
  gitIn(cwd, "add", ".");
  gitIn(cwd, "commit", "-q", "-m", `edit ${file}`);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-guard-"));
  origin = path.join(dir, "origin.git");
  main = path.join(dir, "main");
  base = path.join(dir, "home");
  gitIn(dir, "init", "-q", "--bare", origin);
  gitIn(dir, "clone", "-q", origin, main);
  gitIn(main, "switch", "-q", "-c", "main");
  commit(main, "orquestator-cli/protected-paths.txt", RULES);
  commit(main, "AGENTS.md", "reglas");
  commit(main, "README.md", "hola");
  gitIn(main, "push", "-q", "origin", "main");

  const repo = path.join(base, KEY, "repo");
  fs.mkdirSync(path.join(base, KEY), { recursive: true });
  gitIn(base, "clone", "-q", main, repo);
  gitIn(repo, "switch", "-q", "-c", `${KEY}-algo`);
  commit(repo, "AGENTS.md", "reglas cambiadas");
  task = repo;
  mirror = path.join(base, "upstream.git");
  gitIn(base, "clone", "-q", "--bare", origin, mirror);
  save(
    KEY,
    transition({ ...createState(KEY), branch: `${KEY}-algo` }, "In Progress"),
    base,
  );
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test("parsePaths entiende prefijos, exactos y no aprobables", () => {
  const rules = parsePaths(RULES);
  assert.deepEqual(rules[0], {
    path: "AGENTS.md",
    prefix: false,
    noApprove: false,
  });
  assert.deepEqual(rules[1], {
    path: "orquestator-cli/",
    prefix: true,
    noApprove: false,
  });
  assert.deepEqual(rules[2], {
    path: ".github/workflows/",
    prefix: true,
    noApprove: true,
  });
});

test("analyze marca lo tocado y separa lo no aprobable", () => {
  const rules = parsePaths(RULES);
  assert.deepEqual(analyze(["AGENTS.md", "src/x.ts"], rules).touched, [
    "AGENTS.md",
  ]);
  assert.equal(analyze(["AGENTS.md", "src/x.ts"], rules).noApprove, false);
  assert.equal(analyze([".github/workflows/ci.yml"], rules).noApprove, true);
  assert.equal(analyze(["src/x.ts"], rules).needsApproval, false);
});

test("guardTask importa la rama al checkout principal y ve las rutas tocadas", () => {
  const result = guardTask(KEY, { base, main });
  assert.deepEqual(result.touched, ["AGENTS.md"]);
  assert.equal(result.noApprove, false);
  assert.equal(result.approval, null);
  assert.match(result.hash, /^[0-9a-f]{64}$/);
});

test("tras approve el hash coincide y se vale; si el diff cambia, caduca", () => {
  const first = guardTask(KEY, { base, main });
  const approved = approveState(saveAndReload(first.state), {
    hash: first.hash,
    reason: "lo reviso yo",
    isTTY: true,
  });
  save(KEY, approved, base);
  assert.ok(guardTask(KEY, { base, main }).approval);
  commit(task, "AGENTS.md", "otra vez");
  assert.equal(guardTask(KEY, { base, main }).approval, null);
});

function saveAndReload(state) {
  save(KEY, state, base);
  return state;
}

test("approve exige TTY y motivo", () => {
  const state = transition(createState(KEY), "In Progress");
  assert.throws(
    () => approveState(state, { hash: "h", reason: "x", isTTY: false }),
    /terminal/,
  );
  assert.throws(
    () => approveState(state, { hash: "h", reason: " ", isTTY: true }),
    /motivo/,
  );
});

test("un diff.external o un pre-push malicioso del clon no se ejecutan", () => {
  const marker = path.join(dir, "pwned");
  const hooks = path.join(dir, "hooks");
  fs.mkdirSync(hooks);
  fs.writeFileSync(
    path.join(hooks, "pre-push"),
    `#!/bin/sh\ntouch ${marker}\n`,
    { mode: 0o755 },
  );
  gitIn(task, "config", "core.hooksPath", hooks);
  gitIn(task, "config", "diff.external", `sh -c "touch ${marker}"`);
  // El hook del lado servidor tampoco se toca: nunca hacemos fetch del clon.
  gitIn(
    task,
    "config",
    "uploadpack.packObjectsHook",
    `sh -c "touch ${marker}"`,
  );
  guardTask(KEY, { base, main });
  assert.equal(fs.existsSync(marker), false);
});

test("diffFiles y diffPatch leen del checkout principal, no del clon", () => {
  guardTask(KEY, { base, main });
  const ref = `refs/orquestator/${KEY}`;
  assert.deepEqual(diffFiles({ main, ref }), ["AGENTS.md"]);
  assert.match(diffPatch({ main, ref }), /reglas cambiadas/);
});
