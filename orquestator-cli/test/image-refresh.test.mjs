import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { fetchMirror } from "../lib/checkout.mjs";
import { refreshImage } from "../lib/image-refresh.mjs";

let dir;
let base;
let main;
let mirror;
let out;

function gitRunRecorder({ failMirror = false } = {}) {
  const calls = [];
  const gitRun = (args, options = {}) => {
    calls.push({ args, cwd: options.cwd });
    if (args[0] === "remote") return "https://github.com/ifmael/esencial.git";
    if (failMirror && options.cwd === mirror) {
      throw new Error("git fetch --prune origin falló: sin red");
    }
    return "";
  };
  return { calls, gitRun };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-refresh-"));
  base = path.join(dir, "home");
  main = path.join(dir, "main");
  mirror = path.join(base, "upstream.git");
  out = [];
  fs.mkdirSync(main, { recursive: true });
  fs.mkdirSync(mirror, { recursive: true });
  fs.writeFileSync(path.join(mirror, "HEAD"), "ref: refs/heads/main\n");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test("el refresco hace los dos fetches y garantiza la imagen del espejo", async () => {
  const { calls, gitRun } = gitRunRecorder();
  const ensured = [];
  const result = await refreshImage({
    base,
    main,
    mirror,
    env: {},
    token: null,
    gitRun,
    tag: () => "esencial-worker:zzz",
    ensure: async (tag, options) => {
      ensured.push({ tag, options });
      return { tag, built: true };
    },
    out: (text) => out.push(text),
  });
  assert.equal(result.built, true);
  assert.equal(calls[0].args[0], "remote");
  assert.deepEqual(
    calls.filter((call) => call.args[0] === "fetch").map((call) => call.cwd),
    [mirror, main],
  );
  assert.deepEqual(
    calls.find((call) => call.cwd === main && call.args[0] === "fetch").args,
    ["fetch", "--prune", "--no-tags", "origin"],
  );
  assert.equal(ensured.length, 1);
  assert.equal(ensured[0].tag, "esencial-worker:zzz");
  assert.equal(ensured[0].options.base, base);
});

test("con ORQUESTATOR_IMAGE el refresco hace los fetches y no construye", async () => {
  const { calls, gitRun } = gitRunRecorder();
  let built = false;
  const result = await refreshImage({
    base,
    main,
    mirror,
    env: { ORQUESTATOR_IMAGE: "esencial-worker:manual" },
    token: null,
    gitRun,
    ensure: async () => {
      built = true;
    },
    out: (text) => out.push(text),
  });
  assert.equal(result.skipped, true);
  assert.equal(built, false);
  assert.equal(
    calls.filter((call) => call.args[0] === "fetch").length,
    2,
    "los dos fetches siguen",
  );
});

test("si el fetch del espejo falla se sigue con el que hay y se avisa", async () => {
  const { gitRun } = gitRunRecorder({ failMirror: true });
  const ensured = [];
  await refreshImage({
    base,
    main,
    mirror,
    env: {},
    token: null,
    gitRun,
    tag: () => "esencial-worker:zzz",
    ensure: async (tag) => ensured.push(tag),
    out: (text) => out.push(text),
  });
  assert.deepEqual(ensured, ["esencial-worker:zzz"]);
  assert.match(out.join("\n"), /espejo/);
  assert.match(out.join("\n"), /sigo/);
});

test("fetchMirror sin espejo manda a ejecutar start", () => {
  assert.throws(
    () =>
      fetchMirror({
        mirror: path.join(dir, "no.git"),
        source: "https://github.com/ifmael/esencial.git",
        token: null,
        gitRun: () => "",
      }),
    /espejo.*start/,
  );
});
