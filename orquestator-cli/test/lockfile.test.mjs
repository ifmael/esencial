import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  lockfileGate,
  lockfileMissing,
  packageKeys,
} from "../lib/lockfile.mjs";

const BASE = `lockfileVersion: '9.0'

importers:
  .:
    devDependencies:
      '@biomejs/biome':
        specifier: 2.6.2
        version: 2.6.2

packages:
  '@biomejs/biome@2.6.2':
    resolution: {integrity: sha512-aaa}
  esbuild@0.28.1:
    resolution: {integrity: sha512-bbb}

snapshots:
  '@biomejs/biome@2.6.2': {}
`;

let dir;
let repo;
let mirror;

function gitIn(cwd, ...args) {
  return execFileSync(
    "git",
    ["-c", "user.email=t@test", "-c", "user.name=Test", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-lock-"));
  repo = path.join(dir, "repo");
  mirror = path.join(dir, "home", "upstream.git");
  fs.mkdirSync(repo);
  fs.mkdirSync(path.dirname(mirror), { recursive: true });
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test("packageKeys lee los pares paquete+versión de packages:", () => {
  assert.deepEqual([...packageKeys(BASE)].sort(), [
    "@biomejs/biome@2.6.2",
    "esbuild@0.28.1",
  ]);
});

test("añadir en main no cierra la puerta", () => {
  const recipe = BASE.replace(
    "snapshots:",
    "  react@19.0.0:\n    resolution: {integrity: sha512-ccc}\n\nsnapshots:",
  );
  assert.deepEqual(lockfileMissing({ branch: BASE, recipe }), []);
});

test("cambiar una versión en main sí cierra la puerta", () => {
  const recipe = BASE.replaceAll("2.6.2", "2.6.3");
  assert.deepEqual(lockfileMissing({ branch: BASE, recipe }), [
    "@biomejs/biome@2.6.2",
  ]);
});

test("la puerta lee el lockfile del clon y el main del espejo", () => {
  fs.writeFileSync(path.join(repo, "pnpm-lock.yaml"), BASE);
  gitIn(dir, "init", "-q", "-b", "main", path.join(dir, "work"));
  const work = path.join(dir, "work");
  fs.writeFileSync(
    path.join(work, "pnpm-lock.yaml"),
    BASE.replaceAll("2.6.2", "2.6.3"),
  );
  gitIn(work, "add", ".");
  gitIn(work, "commit", "-q", "-m", "receta");
  execFileSync("git", ["clone", "-q", "--bare", work, mirror]);

  assert.throws(
    () => lockfileGate({ repo, mirror }),
    (error) => {
      assert.equal(error.code, "LOCKFILE_DRIFT");
      assert.match(error.message, /@biomejs\/biome@2\.6\.2/);
      assert.match(error.message, /merge/);
      assert.match(error.message, /adr\/0013/);
      return true;
    },
  );
});

test("con los dos lockfiles iguales la puerta abre", () => {
  fs.writeFileSync(path.join(repo, "pnpm-lock.yaml"), BASE);
  const work = path.join(dir, "work");
  gitIn(dir, "init", "-q", "-b", "main", work);
  fs.writeFileSync(path.join(work, "pnpm-lock.yaml"), BASE);
  gitIn(work, "add", ".");
  gitIn(work, "commit", "-q", "-m", "receta");
  execFileSync("git", ["clone", "-q", "--bare", work, mirror]);
  assert.equal(lockfileGate({ repo, mirror }), null);
});

test("sin espejo la puerta manda a ejecutar start", () => {
  fs.writeFileSync(path.join(repo, "pnpm-lock.yaml"), BASE);
  assert.throws(
    () => lockfileGate({ repo, mirror: path.join(dir, "no.git") }),
    /espejo.*start/,
  );
});
