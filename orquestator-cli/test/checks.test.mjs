import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { ARTIFACTS } from "../lib/artifacts.mjs";
import { CHECK_COMMAND, checkTask } from "../lib/checks.mjs";
import { reserveMigration } from "../lib/migrations.mjs";
import { createState, save, transition } from "../lib/state.mjs";

let dir;
let task;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-chk-"));
  fs.mkdirSync(path.join(dir, "ESN-7", "repo"), { recursive: true });
  fs.mkdirSync(path.join(dir, "ESN-7", "task"), { recursive: true });
  fs.mkdirSync(path.join(dir, "upstream.git"));
  task = path.join(dir, "ESN-7", "task");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function started(key = "ESN-7") {
  const state = transition(
    { ...createState(key), branch: `${key}-x` },
    "In Progress",
  );
  save(key, state, dir);
  return state;
}

test("checkTask exige una tarea empezada", () => {
  assert.throws(
    () => checkTask("ESN-7", { base: dir, runner: () => ({ status: 0 }) }),
    /no existe/,
  );
});

test("checkTask corre la cadena completa en la fase check y escribe checks.md", () => {
  started();
  let seen;
  const result = checkTask("ESN-7", {
    base: dir,
    runner: (options) => {
      seen = options;
      return { status: 0, stdout: "todo verde", stderr: "" };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(seen.phase, "check");
  assert.equal(seen.command, CHECK_COMMAND);
  assert.match(
    fs.readFileSync(path.join(task, "checks.md"), "utf8"),
    /Resultado: PASS/,
  );
  assert.match(
    fs.readFileSync(path.join(task, "checks.md"), "utf8"),
    /todo verde/,
  );
});

test("un fallo deja FAIL con el código y la salida", () => {
  started();
  const result = checkTask("ESN-7", {
    base: dir,
    runner: () => ({ status: 2, stdout: "", stderr: "test rojo" }),
  });
  assert.equal(result.ok, false);
  const md = fs.readFileSync(path.join(task, "checks.md"), "utf8");
  assert.match(md, /Resultado: FAIL \(exit 2\)/);
  assert.match(md, /test rojo/);
});

test("checkTask no escribe en dry-run", () => {
  started();
  let seen;
  const result = checkTask("ESN-7", {
    base: dir,
    dryRun: true,
    out: () => {},
    runner: (options) => {
      seen = options;
      return null;
    },
  });
  assert.equal(result.ok, null);
  assert.equal(seen.dryRun, true);
  assert.equal(fs.readFileSync(path.join(task, "checks.md"), "utf8"), "");
});

test("checkTask reserva la migración y choca con otra tarea", () => {
  started();
  reserveMigration({ base: dir, key: "ESN-1", files: ["0001_x.sql"] });
  assert.throws(
    () =>
      checkTask("ESN-7", {
        base: dir,
        files: ["api/migrations/0027_x.sql"],
        runner: () => ({ status: 0 }),
      }),
    (error) => error.code === "MIGRATION_LOCKED" && /ESN-1/.test(error.message),
  );
});

test("checkTask integra la sonda RED y la escribe en checks.md", () => {
  started();
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.email=t@test", "-c", "user.name=Test", ...args],
      {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  git("init", "-q", "--bare", path.join(dir, "origin.git"));
  git("clone", "-q", path.join(dir, "origin.git"), path.join(dir, "main"));
  const mainRepo = path.join(dir, "main");
  execFileSync("git", ["-C", mainRepo, "switch", "-q", "-c", "main"]);
  fs.mkdirSync(path.join(mainRepo, "api", "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(mainRepo, "api", "tests", "a.test.ts"),
    'test("a", () => {});\n',
  );
  execFileSync("git", ["-C", mainRepo, "add", "."]);
  execFileSync("git", ["-C", mainRepo, "commit", "-q", "-m", "base"]);
  execFileSync("git", ["-C", mainRepo, "push", "-q", "origin", "main"]);

  const repo = path.join(dir, "ESN-7", "repo");
  execFileSync("git", ["clone", "-q", mainRepo, repo]);
  execFileSync("git", ["-C", repo, "switch", "-q", "-c", "ESN-7-x"]);
  fs.writeFileSync(
    path.join(repo, "api", "tests", "a.test.ts"),
    'test("a", () => { expect(1).toBe(1); });\n',
  );
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", ["-C", repo, "commit", "-q", "-m", "test"]);

  const calls = [];
  const result = checkTask("ESN-7", {
    base: dir,
    main: mainRepo,
    files: ["api/tests/a.test.ts"],
    runner: (options) => {
      calls.push(options.repo);
      return options.repo === repo
        ? { status: 0, stdout: "verde", stderr: "" }
        : { status: 1, stdout: "", stderr: "rojo" };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.match(
    fs.readFileSync(path.join(task, "checks.md"), "utf8"),
    /falla contra main/,
  );
});

test("los artefactos de la fase existen antes de correr", () => {
  started();
  checkTask("ESN-7", { base: dir, runner: () => ({ status: 0 }) });
  for (const name of ARTIFACTS)
    assert.ok(fs.existsSync(path.join(task, name)), name);
});
