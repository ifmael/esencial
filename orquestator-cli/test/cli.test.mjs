import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { main } from "../lib/cli.mjs";
import { createState, load, save, transition } from "../lib/state.mjs";

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-cli-"));
  process.env.ORQUESTATOR_HOME = dir;
});
afterEach(() => {
  delete process.env.ORQUESTATOR_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

function run(args) {
  const out = [];
  const err = [];
  const stdout = { write: (s) => out.push(s) };
  const stderr = { write: (s) => err.push(s) };
  return main(args, { stdout, stderr }).then((code) => ({
    code,
    out: out.join(""),
    err: err.join(""),
  }));
}

test("status sin tarea explica cómo empezar", async () => {
  const r = await run(["status"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /No hay tareas/);
});

test("status de una tarea enseña estado, rama y rutas", async () => {
  const s = transition(createState("ESN-9"), "In Progress");
  s.branch = "ESN-9-algo";
  save("ESN-9", s);
  const r = await run(["status", "ESN-9"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /ESN-9/);
  assert.match(r.out, /In Progress/);
  assert.match(r.out, /ESN-9-algo/);
  assert.match(r.out, new RegExp(path.join(dir, "ESN-9", "task")));
});

test("block deja la tarea bloqueada con la pregunta", async () => {
  save("ESN-9", transition(createState("ESN-9"), "In Progress"));
  const r = await run(["block", "ESN-9", "¿Qué", "tabla?"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Blocked/);
  const s = load("ESN-9");
  assert.equal(s.state, "Blocked");
  assert.equal(s.question, "¿Qué tabla?");
});

test("resume devuelve al estado anterior", async () => {
  let s = transition(createState("ESN-9"), "In Progress");
  s = { ...s, state: "Blocked", blockedFrom: "In Progress", question: "x" };
  save("ESN-9", s);
  const r = await run(["resume", "ESN-9"]);
  assert.equal(r.code, 0);
  assert.equal(load("ESN-9").state, "In Progress");
});

test("start --dry-run no escribe estado ni clon", async () => {
  const r = await run(["start", "ESN-1", "--dry-run"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /dry-run/);
  assert.match(r.out, /In Progress/);
  assert.equal(load("ESN-1"), null);
  assert.equal(fs.existsSync(path.join(dir, "ESN-1")), false);
});

test("start se niega si la tarea ya está empezada", async () => {
  save("ESN-1", transition(createState("ESN-1"), "In Progress"));
  const r = await run(["start", "ESN-1"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /ya está empezada/);
});

test("check --dry-run enseña la cadena sin ejecutar docker", async () => {
  save("ESN-9", transition(createState("ESN-9"), "In Progress"));
  fs.mkdirSync(path.join(dir, "ESN-9", "repo"), { recursive: true });
  fs.mkdirSync(path.join(dir, "ESN-9", "task"), { recursive: true });
  fs.mkdirSync(path.join(dir, "upstream.git"));
  const r = await run(["check", "ESN-9", "--dry-run"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /docker run/);
  assert.match(r.out, /pnpm e2e/);
});

test("--dry-run no escribe nada", async () => {
  save("ESN-9", transition(createState("ESN-9"), "In Progress"));
  const r = await run(["block", "ESN-9", "x", "--dry-run"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /dry-run/);
  assert.equal(load("ESN-9").state, "In Progress");
});

test("un comando desconocido y una clave mala salen con 2", async () => {
  assert.equal((await run(["nope"])).code, 2);
  assert.equal((await run(["status", "ESN"])).code, 2);
});

test("status de una clave inexistente sale con 1", async () => {
  const r = await run(["status", "ESN-404"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /no existe/);
});
