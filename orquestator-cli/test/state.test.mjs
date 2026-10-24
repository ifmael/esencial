import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  block,
  createState,
  load,
  normalize,
  resume,
  save,
  transition,
  withLock,
} from "../lib/state.mjs";

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-"));
  process.env.ORQUESTATOR_HOME = dir;
});
afterEach(() => {
  delete process.env.ORQUESTATOR_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

test("normaliza nombres y alias de estado", () => {
  assert.equal(normalize("in-progress"), "In Progress");
  assert.equal(normalize("In Progress"), "In Progress");
  assert.equal(normalize("in_validation"), "In validation");
  assert.throws(() => normalize("terminado"), /Estado desconocido/);
});

test("una tarea nace en Ready y guarda su historia", () => {
  const s = createState("ESN-7");
  assert.equal(s.state, "Ready");
  assert.equal(s.key, "ESN-7");
  assert.deepEqual(
    s.history.map((h) => h.state),
    ["Ready"],
  );
});

test("las transiciones válidas avanzan y registran la historia", () => {
  let s = createState("ESN-7");
  s = transition(s, "In Progress");
  s = transition(s, "In validation");
  assert.equal(s.state, "In validation");
  assert.deepEqual(
    s.history.map((h) => h.state),
    ["Ready", "In Progress", "In validation"],
  );
});

test("un salto inválido falla y no cambia el estado", () => {
  const s = createState("ESN-7");
  assert.throws(
    () => transition(s, "Done"),
    /Transición inválida: Ready → Done/,
  );
  assert.equal(s.state, "Ready");
});

test("un salto directo a un estado ya alcanzado también falla", () => {
  const s = transition(createState("ESN-7"), "In Progress");
  assert.throws(() => transition(s, "In Progress"), /ya está en In Progress/);
});

test("block guarda el estado de origen y la pregunta; resume vuelve", () => {
  let s = transition(createState("ESN-7"), "In Progress");
  s = block(s, "¿Qué tabla?");
  assert.equal(s.state, "Blocked");
  assert.equal(s.blockedFrom, "In Progress");
  assert.equal(s.question, "¿Qué tabla?");
  const back = resume(s);
  assert.equal(back.state, "In Progress");
  assert.equal(back.blockedFrom, null);
  assert.equal(back.question, null);
});

test("block exige pregunta y estado de origen válido", () => {
  assert.throws(
    () => block(createState("ESN-7"), "  "),
    /necesita una pregunta/,
  );
  assert.throws(
    () => block(createState("ESN-7"), "x"),
    /No se puede bloquear desde Ready/,
  );
});

test("resume exige estar bloqueado", () => {
  assert.throws(() => resume(createState("ESN-7")), /no está bloqueada/);
});

test("guardar y cargar conserva el estado; sin fichero devuelve null", () => {
  assert.equal(load("ESN-7"), null);
  const s = transition(createState("ESN-7"), "In Progress");
  save("ESN-7", s);
  const back = load("ESN-7");
  assert.equal(back.state, "In Progress");
  assert.equal(back.key, "ESN-7");
});

test("el estado rechaza claves que no son de tarea", () => {
  assert.throws(() => createState("ESN"), /Clave inválida/);
  assert.throws(() => createState("../x"), /Clave inválida/);
});

test("withLock no deja el cerrojo tras soltarlo y tolera un cerrojo viejo", () => {
  withLock("ESN-7", () => {});
  const lock = path.join(dir, "ESN-7", "state.lock");
  assert.equal(fs.existsSync(lock), false);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, "999");
  const old = new Date(Date.now() - 10 * 60 * 1000);
  fs.utimesSync(lock, old, old);
  withLock("ESN-7", () => {});
  assert.equal(fs.existsSync(lock), false);
});
