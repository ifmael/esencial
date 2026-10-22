import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { redProbe, testFiles, weakSignals } from "../lib/red.mjs";

let dir;
let main;
let repo;

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

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-red-"));
  main = path.join(dir, "main");
  repo = path.join(dir, "repo");
  gitIn(dir, "init", "-q", "--bare", path.join(dir, "origin.git"));
  gitIn(dir, "clone", "-q", path.join(dir, "origin.git"), main);
  gitIn(main, "switch", "-q", "-c", "main");
  fs.mkdirSync(path.join(main, "api", "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(main, "api", "tests", "a.test.ts"),
    'test("uno", () => { expect(1).toBe(1); });\n',
  );
  gitIn(main, "add", ".");
  gitIn(main, "commit", "-q", "-m", "base");
  gitIn(main, "push", "-q", "origin", "main");
  gitIn(dir, "clone", "-q", main, repo);
  gitIn(repo, "switch", "-q", "-c", "ESN-7-x");
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test("testFiles reconoce los tests de api, web y e2e", () => {
  assert.deepEqual(
    testFiles([
      "api/tests/a.test.ts",
      "web/tests/b.test.tsx",
      "e2e/tests/c.spec.ts",
      "src/x.ts",
    ]),
    ["api/tests/a.test.ts", "web/tests/b.test.tsx", "e2e/tests/c.spec.ts"],
  );
});

test("weakSignals detecta skips nuevos, menos tests y menos expects", () => {
  const before =
    'test("a", () => { expect(1).toBe(1); });\ntest("b", () => { expect(2).toBe(2); });\n';
  const after = 'test.skip("a", () => { expect(1).toBe(1); });\n';
  const signals = weakSignals(before, after);
  assert.ok(signals.some((s) => s.includes("skip")));
  assert.ok(signals.some((s) => s.includes("tests")));
  assert.ok(signals.some((s) => s.includes("expect")));
});

test("redProbe copia el test de la rama sobre main y espera que falle", () => {
  fs.writeFileSync(
    path.join(repo, "api", "tests", "a.test.ts"),
    'test("uno", () => { expect(2).toBe(2); });\n',
  );
  const seen = [];
  let copied = "";
  const runner = (options) => {
    seen.push(options);
    copied = fs.readFileSync(
      path.join(options.repo, "api", "tests", "a.test.ts"),
      "utf8",
    );
    return { status: 1, stdout: "falla", stderr: "" };
  };
  const result = redProbe({
    main,
    repo,
    files: ["api/tests/a.test.ts"],
    run: runner,
    base: dir,
  });
  assert.equal(result.failedAsExpected, 1);
  assert.equal(result.passing, 0);
  const worktree = seen[0].repo;
  assert.match(copied, /expect\(2\)/);
  assert.equal(fs.existsSync(worktree), false);
  assert.match(result.notes.join("\n"), /RED/);
});

test("redProbe avisa si el test también pasa contra main", () => {
  fs.writeFileSync(
    path.join(repo, "api", "tests", "a.test.ts"),
    'test("uno", () => { expect(1).toBe(1); });\n',
  );
  const result = redProbe({
    main,
    repo,
    files: ["api/tests/a.test.ts"],
    run: () => ({ status: 0, stdout: "ok", stderr: "" }),
    base: dir,
  });
  assert.equal(result.passing, 1);
  assert.match(result.notes.join("\n"), /pasa contra main/);
});
