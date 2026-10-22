import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { cloneTask, ensureMirror, git } from "../lib/checkout.mjs";

let dir;
let source;
let mirror;
let repo;

const GIT = ["-c", "user.email=t@test", "-c", "user.name=Test"];

function commit(file, text) {
  fs.writeFileSync(path.join(source, file), text);
  git([...GIT, "add", "."], { cwd: source });
  git([...GIT, "commit", "-q", "-m", `add ${file}`], { cwd: source });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-co-"));
  source = path.join(dir, "source");
  mirror = path.join(dir, "upstream.git");
  repo = path.join(dir, "repo");
  fs.mkdirSync(source);
  git(["init", "-q", "-b", "main"], { cwd: source });
  commit("README.md", "hola");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ensureMirror crea el espejo bare y luego lo actualiza", () => {
  ensureMirror({ mirror, source });
  assert.ok(fs.existsSync(path.join(mirror, "HEAD")));
  commit("dos.md", "dos");
  ensureMirror({ mirror, source });
  const log = git(["log", "--oneline", "main"], { cwd: mirror });
  assert.match(log, /add dos\.md/);
});

test("cloneTask clona de forma local, sin hardlinks y con su rama", () => {
  ensureMirror({ mirror, source });
  cloneTask({ mirror, repo, branch: "ESN-7-exportar" });
  assert.equal(fs.readFileSync(path.join(repo, "README.md"), "utf8"), "hola");
  assert.equal(
    git(["branch", "--show-current"], { cwd: repo }),
    "ESN-7-exportar",
  );
  assert.equal(
    fs.existsSync(path.join(repo, ".git", "objects", "info", "alternates")),
    false,
  );
  assert.equal(git(["remote"], { cwd: repo }), "");
});

test("cloneTask no pisa un clon existente", () => {
  ensureMirror({ mirror, source });
  cloneTask({ mirror, repo, branch: "ESN-7-a" });
  assert.throws(
    () => cloneTask({ mirror, repo, branch: "ESN-7-b" }),
    /ya existe/,
  );
});

test("cloneTask falla claro si el espejo no está", () => {
  assert.throws(() => cloneTask({ mirror, repo, branch: "ESN-7-a" }), /espejo/);
});

test("execFileSync roto se convierte en error con la salida de git", () => {
  assert.throws(() => git(["rev-parse", "nope"], { cwd: dir }), /git/);
});
