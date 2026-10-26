import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { writeArtifact } from "../lib/artifacts.mjs";
import { approveState, guardTask } from "../lib/guard.mjs";
import { publishPrReview, ship } from "../lib/ship.mjs";
import { createState, load, save, transition } from "../lib/state.mjs";

const KEY = "ESN-7";
const RULES = "AGENTS.md\n";

let dir;
let main;
let base;
let task;

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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-ship-"));
  main = path.join(dir, "main");
  base = path.join(dir, "home");
  const origin = path.join(dir, "origin.git");
  gitIn(dir, "init", "-q", "--bare", origin);
  gitIn(dir, "clone", "-q", origin, main);
  gitIn(main, "switch", "-q", "-c", "main");
  commit(main, "orquestator-cli/protected-paths.txt", RULES);
  commit(main, "README.md", "hola");
  gitIn(main, "push", "-q", "origin", "main");

  task = path.join(base, KEY, "repo");
  fs.mkdirSync(path.join(base, KEY), { recursive: true });
  gitIn(base, "clone", "-q", main, task);
  gitIn(task, "switch", "-q", "-c", `${KEY}-algo`);
  commit(task, "AGENTS.md", "reglas cambiadas");
  gitIn(base, "clone", "-q", "--bare", origin, path.join(base, "upstream.git"));
  process.env.ORQUESTATOR_HOME = base;
  save(
    KEY,
    transition(
      {
        ...createState(KEY),
        branch: `${KEY}-algo`,
        issueTitle: "Algo",
        pr: { number: 9, url: "u" },
      },
      "In Progress",
    ),
    base,
  );
});

afterEach(() => {
  delete process.env.ORQUESTATOR_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

function approve(hash) {
  save(
    KEY,
    approveState(load(KEY, base), { hash, reason: "ok", isTTY: true }),
    base,
  );
}

test("ship se niega sin PR, sin body o sin aprobación", () => {
  assert.throws(() => ship(KEY, { main, ghRun: () => "" }), /pr-body/);
  writeArtifact(KEY, "pr-body.md", "Fixes ESN-7\n");
  assert.throws(() => ship(KEY, { main, ghRun: () => "" }), /approve/);
});

test("ship edita el body, comenta review/checks y publica el status", () => {
  writeArtifact(KEY, "pr-body.md", "Fixes ESN-7\n");
  writeArtifact(KEY, "checks.md", "PASS");
  writeArtifact(KEY, "review.md", "sin hallazgos");
  approve(guardTask(KEY, { base, main }).hash);
  const calls = [];
  const ghRun = (args) => {
    calls.push(args);
    if (args[1] === "view")
      return JSON.stringify({ number: 9, url: "u", headRefOid: "sha9" });
    return "";
  };
  const result = ship(KEY, { main, ghRun, checksRun: () => ({ status: 0 }) });
  assert.equal(result.sha, "sha9");
  const kinds = calls.map((a) => a[1]);
  assert.ok(kinds.includes("edit"));
  assert.equal(kinds.filter((k) => k === "comment").length, 1);
  assert.equal(kinds.filter((k) => k === "review").length, 1);
  assert.equal(load(KEY, base).state, "In validation");
  const status = calls.find((a) => a[0] === "api");
  assert.ok(status[1].endsWith("/sha9"));
});

test("ship omite los comentarios vacíos y el dry-run no hace nada", () => {
  writeArtifact(KEY, "pr-body.md", "Fixes ESN-7\n");
  approve(guardTask(KEY, { base, main }).hash);
  const calls = [];
  const ghRun = (args) => {
    calls.push(args);
    if (args[1] === "view")
      return JSON.stringify({ number: 9, url: "u", headRefOid: "sha9" });
    return "";
  };
  ship(KEY, { main, ghRun, checksRun: () => ({ status: 0 }) });
  assert.equal(calls.filter((a) => a[1] === "comment").length, 0);
  assert.equal(calls.filter((a) => a[1] === "review").length, 0);
  calls.length = 0;
  ship(KEY, { main, ghRun, dryRun: true, out: () => {} });
  assert.deepEqual(calls, []);
});

test("ship publica el status gh-guard antes de esperar a la CI", () => {
  writeArtifact(KEY, "pr-body.md", "Fixes ESN-7\n");
  approve(guardTask(KEY, { base, main }).hash);
  const calls = [];
  const ghRun = (args) => {
    calls.push(args);
    if (args[1] === "view")
      return JSON.stringify({ number: 9, url: "u", headRefOid: "sha9" });
    return "";
  };
  let statusPosted = false;
  ship(KEY, {
    main,
    ghRun,
    checksRun: () => {
      statusPosted = calls.some((args) => args[0] === "api");
      return { status: 0 };
    },
  });
  assert.equal(statusPosted, true);
});

test("ship espera a la CI y no pasa a In validation si falla", () => {
  writeArtifact(KEY, "pr-body.md", "Fixes ESN-7\n");
  approve(guardTask(KEY, { base, main }).hash);
  const ghRun = (args) => {
    if (args[1] === "view")
      return JSON.stringify({ number: 9, url: "u", headRefOid: "sha9" });
    return "";
  };
  const calls = [];
  assert.throws(
    () =>
      ship(KEY, {
        main,
        ghRun,
        checksRun: (n) => {
          calls.push(n);
          return { status: 1, stderr: "ci rojo" };
        },
      }),
    /CI.*no está verde/,
  );
  assert.deepEqual(calls, [9]);
  assert.equal(load(KEY, base).state, "In Progress");
});

test("publishPrReview exige PR y pr-review, y la comenta sin tocar el body", () => {
  const calls = [];
  const ghRun = (args) => {
    calls.push(args);
    return "";
  };
  writeArtifact(KEY, "pr-review.md", "");
  assert.throws(
    () => publishPrReview(KEY, { base, ghRun }),
    /pr-review\.md está vacío/,
  );
  writeArtifact(KEY, "pr-review.md", "Veredicto: APROBADO\n");
  const result = publishPrReview(KEY, { base, ghRun });
  assert.equal(result.number, 9);
  assert.deepEqual(calls, [
    [
      "pr",
      "comment",
      "9",
      "--body-file",
      path.join(base, KEY, "task", "pr-review.md"),
    ],
  ]);
});
