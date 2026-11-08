import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { imageTag, mirrorBlob } from "../lib/image.mjs";
import { exportMirror } from "../lib/image-build.mjs";

let dir;
let base;
let work;
let mirror;

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

function commitRecipe(dockerfile, lockfile) {
  fs.mkdirSync(path.join(work, "orquestator-cli"), { recursive: true });
  fs.writeFileSync(
    path.join(work, "orquestator-cli", "Dockerfile"),
    dockerfile,
  );
  fs.writeFileSync(path.join(work, "pnpm-lock.yaml"), lockfile);
  gitIn(work, "add", ".");
  gitIn(work, "commit", "-q", "-m", "receta");
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-img-"));
  base = path.join(dir, "home");
  work = path.join(dir, "work");
  mirror = path.join(base, "upstream.git");
  fs.mkdirSync(base, { recursive: true });
  gitIn(dir, "init", "-q", "-b", "main", work);
  commitRecipe("FROM x\n", "lockfileVersion: 9\n");
  gitIn(dir, "clone", "-q", "--bare", work, mirror);
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test("imageTag es el mismo hash que build.sh, leído del main del espejo", () => {
  const expected = createHash("sha256")
    .update("FROM x\nlockfileVersion: 9\n")
    .digest("hex")
    .slice(0, 12);
  assert.equal(imageTag({ base, mirror }), `esencial-worker:${expected}`);
});

test("imageTag no lee el árbol de trabajo: manda el espejo", () => {
  fs.writeFileSync(
    path.join(work, "orquestator-cli", "Dockerfile"),
    "FROM y\n",
  );
  fs.writeFileSync(
    path.join(work, "pnpm-lock.yaml"),
    "lockfileVersion: 9\n# otra\n",
  );
  gitIn(work, "commit", "-q", "-a", "-m", "receta cambiada");
  const expected = createHash("sha256")
    .update("FROM x\nlockfileVersion: 9\n")
    .digest("hex")
    .slice(0, 12);
  assert.equal(imageTag({ base, mirror }), `esencial-worker:${expected}`);
});

test("imageTag sigue al main del espejo cuando la receta cambia", () => {
  commitRecipe("FROM z\n", "lockfileVersion: 9\n");
  gitIn(work, "push", "-q", mirror, "main:main");
  const expected = createHash("sha256")
    .update("FROM z\nlockfileVersion: 9\n")
    .digest("hex")
    .slice(0, 12);
  assert.equal(imageTag({ base, mirror }), `esencial-worker:${expected}`);
});

test("imageTag sin espejo manda a ejecutar start", () => {
  assert.throws(
    () => imageTag({ base, mirror: path.join(dir, "no.git") }),
    /espejo.*start/,
  );
});

test("mirrorBlob devuelve los bytes exactos del main del espejo", () => {
  const blob = mirrorBlob(mirror, "orquestator-cli/Dockerfile");
  assert.equal(Buffer.from(blob).toString("utf8"), "FROM x\n");
});

test("ORQUESTATOR_IMAGE manda sobre el hash", () => {
  assert.equal(
    imageTag({
      base,
      mirror,
      env: { ORQUESTATOR_IMAGE: "esencial-worker:manual" },
    }),
    "esencial-worker:manual",
  );
});

test("exportMirror saca el contexto del commit del espejo", () => {
  const target = fs.mkdtempSync(path.join(dir, "ctx-"));
  const work = exportMirror({ mirror, dir: target });
  assert.equal(
    fs.readFileSync(
      path.join(work.dir, "orquestator-cli", "Dockerfile"),
      "utf8",
    ),
    "FROM x\n",
  );
  assert.equal(
    fs.readFileSync(path.join(work.dir, "pnpm-lock.yaml"), "utf8"),
    "lockfileVersion: 9\n",
  );
  work.cleanup();
  assert.equal(fs.existsSync(target), false);
});

test("exportMirror sin espejo manda a ejecutar start y no deja contexto", () => {
  const contexts = () =>
    fs
      .readdirSync(os.tmpdir())
      .filter((name) => name.startsWith("orquestator-img-ctx-")).length;
  const before = contexts();
  assert.throws(
    () => exportMirror({ mirror: path.join(dir, "no.git") }),
    /espejo.*start/,
  );
  assert.equal(contexts(), before);
});
