import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { approveState, guardTask } from "../lib/guard.mjs";
import { publish, pushBranch } from "../lib/pr.mjs";
import { createState, load, save, transition } from "../lib/state.mjs";

const KEY = "ESN-7";
const RULES = "orquestator-cli/\nAGENTS.md\n";

let dir;
let main;
let origin;
let task;
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

function stateWith(overrides = {}) {
  return transition(
    { ...createState(KEY), branch: `${KEY}-algo`, ...overrides },
    "In Progress",
  );
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-pr-"));
  origin = path.join(dir, "origin.git");
  main = path.join(dir, "main");
  base = path.join(dir, "home");
  gitIn(dir, "init", "-q", "--bare", origin);
  gitIn(dir, "clone", "-q", origin, main);
  gitIn(main, "switch", "-q", "-c", "main");
  commit(main, "orquestator-cli/protected-paths.txt", RULES);
  commit(main, "README.md", "hola");
  gitIn(main, "push", "-q", "origin", "main");

  const repo = path.join(base, KEY, "repo");
  fs.mkdirSync(path.join(base, KEY), { recursive: true });
  gitIn(base, "clone", "-q", main, repo);
  gitIn(repo, "switch", "-q", "-c", `${KEY}-algo`);
  commit(repo, "README.md", "hola cambiado");
  task = repo;
  gitIn(base, "clone", "-q", "--bare", origin, path.join(base, "upstream.git"));
  fs.mkdirSync(path.join(base, KEY, "task"), { recursive: true });
  fs.writeFileSync(path.join(base, KEY, "task", "pr-body.md"), "Fixes ESN-7\n");
  save(KEY, stateWith({ issueTitle: "Cambiar el saludo" }), base);
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test("publish se niega sin la aprobación del diff protegido", () => {
  commit(task, "AGENTS.md", "reglas cambiadas");
  const calls = [];
  assert.throws(
    () => publish(KEY, { base, main, ghRun: (args) => calls.push(args) }),
    /approve/,
  );
  assert.deepEqual(calls, []);
});

test("con aprobación, empuja, abre la PR y publica el status guard", () => {
  commit(task, "AGENTS.md", "reglas cambiadas");
  const guard = guardTask(KEY, { base, main });
  save(
    KEY,
    {
      ...approveState(load(KEY, base), {
        hash: guard.hash,
        reason: "ok",
        isTTY: true,
      }),
      issueTitle: "Cambiar el saludo",
    },
    base,
  );
  const calls = [];
  const ghRun = (args) => {
    calls.push(args);
    if (args[1] === "view") throw new Error("no such pr");
    if (args[1] === "create") return "https://github.com/x/y/pull/9";
    return "";
  };
  const result = publish(KEY, { base, main, ghRun });
  assert.match(result.url, /pull\/9/);
  const branch = gitIn(origin, "rev-parse", `${KEY}-algo`);
  assert.match(branch, /^[0-9a-f]{40}$/);
  const create = calls.find((args) => args[1] === "create");
  assert.equal(create[3], `${KEY} Cambiar el saludo`);
  const status = calls.find((args) => args[0] === "api");
  assert.ok(status.includes("context=guard"));
  assert.ok(status.includes("state=success"));
  assert.ok(status.some((arg) => arg.includes("aprobado")));
  assert.equal(load(KEY, base).pr.number, 9);
});

test("sin rutas protegidas no hace falta aprobar y el status lo dice", () => {
  commit(task, "README.md", "otra cosa");
  // La tarea cambia README (no protegido): el guard no exige aprobación.
  const calls = [];
  const ghRun = (args) => {
    calls.push(args);
    if (args[1] === "view") throw new Error("no such pr");
    if (args[1] === "create") return "https://github.com/x/y/pull/10";
    return "";
  };
  const result = publish(KEY, { base, main, ghRun });
  assert.match(result.url, /pull\/10/);
  const status = calls.find((args) => args[0] === "api");
  assert.ok(status.some((arg) => arg.includes("sin rutas protegidas")));
});

test("pushBranch empuja la ref importada a origin", () => {
  const ref = `refs/orquestator/${KEY}`;
  gitIn(
    task,
    "push",
    "-q",
    path.join(base, "upstream.git"),
    `+refs/heads/${KEY}-algo:refs/heads/${KEY}-algo`,
  );
  gitIn(
    main,
    "fetch",
    "-q",
    path.join(base, "upstream.git"),
    `+refs/heads/${KEY}-algo:${ref}`,
  );
  const sha = pushBranch({ main, key: KEY, branch: `${KEY}-algo` });
  assert.equal(gitIn(origin, "rev-parse", `${KEY}-algo`), sha);
});

test("publish en dry-run no empuja ni llama a gh", () => {
  const calls = [];
  const result = publish(KEY, {
    base,
    main,
    dryRun: true,
    ghRun: (args) => calls.push(args),
    out: () => {},
  });
  assert.equal(result.dryRun, true);
  assert.deepEqual(calls, []);
  assert.throws(() => gitIn(origin, "rev-parse", `${KEY}-algo`));
});
