import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { ACCESS_LOGIN, clean } from "../lib/clean.mjs";
import { readLock, reserveMigration } from "../lib/migrations.mjs";
import { createState, dirFor, save, transition } from "../lib/state.mjs";

const KEY = "ESN-7";
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-clean-"));
  fs.mkdirSync(path.join(dir, KEY, "repo"), { recursive: true });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const okFetch = async () => ({ status: 200, json: async () => ({ ok: true }) });

function done() {
  const state = transition(
    transition(transition(createState(KEY), "In Progress"), "In validation"),
    "Done",
  );
  save(KEY, state, dir);
  return state;
}

test("clean tras el merge borra la tarea y libera la migración", async () => {
  done();
  reserveMigration({ base: dir, key: KEY, files: ["0027_x.sql"] });
  const out = [];
  await clean(KEY, { base: dir, fetchImpl: okFetch, out: (t) => out.push(t) });
  assert.equal(fs.existsSync(dirFor(KEY, dir)), false);
  assert.equal(readLock(dir), null);
  assert.match(out.join("\n"), /OK frontal/);
  assert.match(out.join("\n"), /OK api/);
});

test("clean se niega si no está Done y no se fuerza", async () => {
  save(KEY, transition(createState(KEY), "In Progress"), dir);
  await assert.rejects(
    () => clean(KEY, { base: dir, fetchImpl: okFetch }),
    /In Progress/,
  );
  assert.ok(fs.existsSync(dirFor(KEY, dir)));
});

test("--force limpia aunque no esté Done; --dry-run no toca nada", async () => {
  save(KEY, transition(createState(KEY), "In Progress"), dir);
  await clean(KEY, { base: dir, force: true, fetchImpl: okFetch });
  assert.equal(fs.existsSync(dirFor(KEY, dir)), false);

  done();
  await clean(KEY, {
    base: dir,
    dryRun: true,
    fetchImpl: okFetch,
    out: () => {},
  });
  assert.ok(fs.existsSync(dirFor(KEY, dir)));
});

test("si las comprobaciones fallan, sugiere rollback", async () => {
  done();
  const failing = async (url) => ({
    status: url.includes("/api/") ? 500 : 200,
    json: async () => ({}),
  });
  const out = [];
  await clean(KEY, { base: dir, fetchImpl: failing, out: (t) => out.push(t) });
  assert.match(out.join("\n"), /FALLA api/);
  assert.match(out.join("\n"), /wrangler rollback/);
});

test("un 302 hacia el login de Access cuenta como deploy vivo", async () => {
  done();
  const access = async (url) => ({
    status: 302,
    headers: { get: () => `${ACCESS_LOGIN}cdn-cgi/access/login/` },
    json: async () => ({}),
    url,
  });
  const out = [];
  await clean(KEY, { base: dir, fetchImpl: access, out: (t) => out.push(t) });
  assert.match(out.join("\n"), /OK frontal/);
  assert.match(out.join("\n"), /OK api/);
  assert.doesNotMatch(out.join("\n"), /rollback/);
});

test("un 302 hacia otro sitio sigue siendo fallo", async () => {
  done();
  const elsewhere = async () => ({
    status: 302,
    headers: { get: () => "https://ejemplo.invalid/login" },
    json: async () => ({}),
  });
  const out = [];
  await clean(KEY, {
    base: dir,
    fetchImpl: elsewhere,
    out: (t) => out.push(t),
  });
  assert.match(out.join("\n"), /FALLA frontal/);
  assert.match(out.join("\n"), /wrangler rollback/);
});
