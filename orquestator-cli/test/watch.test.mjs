import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { block, createState, load, save, transition } from "../lib/state.mjs";
import { watch, watchLock } from "../lib/watch.mjs";

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-watch-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function inProgress(key = "ESN-1") {
  return transition(createState(key), "In Progress");
}

function inValidation(key = "ESN-1") {
  const state = transition(inProgress(key), "In validation");
  return { ...state, pr: { number: 9, url: "u" } };
}

function options(overrides = {}) {
  return {
    base: dir,
    main: dir,
    apiKey: "k",
    team: "ESN",
    once: true,
    ready: async () => [],
    specs: async () => [],
    issue: async (_apiKey, key) => ({
      identifier: key,
      team: { id: "t", key: "ESN" },
    }),
    move: async () => {},
    edit: async () => {},
    run: async () => ({ ok: true }),
    review: async () => ({ artifact: "Preguntas" }),
    dockerCheck: () => true,
    cleanTask: async () => {},
    sleep: async () => {},
    out: () => {},
    ...overrides,
  };
}

test("watch arranca las issues Ready sin estado local", async () => {
  const calls = [];
  const lines = [];
  await watch(
    options({
      ready: async () => [{ identifier: "ESN-1" }, { identifier: "ESN-2" }],
      maxParallel: 2,
      run: async (key) => {
        calls.push(key);
        return { ok: true };
      },
      out: (text) => lines.push(text),
    }),
  );
  assert.deepEqual(calls.sort(), ["ESN-1", "ESN-2"]);
});

test("watch reanuda In Progress y no repite una Ready ya empezada", async () => {
  save("ESN-1", inProgress(), dir);
  const calls = [];
  await watch(
    options({
      ready: async () => [{ identifier: "ESN-1" }, { identifier: "ESN-2" }],
      maxParallel: 2,
      run: async (key) => {
        calls.push(key);
        return { ok: true };
      },
    }),
  );
  assert.deepEqual(calls, ["ESN-1", "ESN-2"]);
});

test("watch se niega a arrancar sin Docker", async () => {
  await assert.rejects(
    () => watch(options({ dockerCheck: () => false })),
    /Docker no es accesible/,
  );
});

test("una tarea que falla no se reintenta hasta que cambie su estado", async () => {
  save("ESN-1", inProgress(), dir);
  const calls = [];
  const lines = [];
  await watch(
    options({
      run: async () => {
        calls.push("run");
        return { ok: false, stop: "check", error: "exit 1: sin red" };
      },
      out: (text) => lines.push(text),
    }),
  );
  assert.equal(calls.length, 1);
  assert.match(lines.join("\n"), /parado en check — exit 1: sin red/);
});

test("In validation con la PR mergeada pasa a Done y limpia", async () => {
  const state = inValidation();
  save(state.key, state, dir);
  const cleaned = [];
  const lines = [];
  await watch(
    options({
      ghRun: () => JSON.stringify({ state: "MERGED" }),
      cleanTask: async (key) => cleaned.push(key),
      out: (text) => lines.push(text),
    }),
  );
  assert.equal(load(state.key, dir).state, "Done");
  assert.deepEqual(cleaned, [state.key]);
  assert.match(lines.join("\n"), /mergeada/);
});

test("In validation con la PR abierta no toca nada", async () => {
  const state = inValidation();
  save(state.key, state, dir);
  let cleaned = false;
  await watch(
    options({
      ghRun: () => JSON.stringify({ state: "OPEN" }),
      cleanTask: async () => {
        cleaned = true;
      },
    }),
  );
  assert.equal(load(state.key, dir).state, "In validation");
  assert.equal(cleaned, false);
});

test("Blocked no se arranca y una tarea Done se limpia", async () => {
  save("ESN-1", block(inProgress(), "¿Qué hago?"), dir);
  save(
    "ESN-2",
    transition(
      transition(createState("ESN-2"), "In Progress"),
      "In validation",
    ),
    dir,
  );
  const state = load("ESN-2", dir);
  save("ESN-2", transition(state, "Done"), dir);
  const calls = [];
  const cleaned = [];
  await watch(
    options({
      run: async (key) => {
        calls.push(key);
        return { ok: true };
      },
      cleanTask: async (key) => cleaned.push(key),
    }),
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(cleaned, ["ESN-2"]);
});

test("dry-run no escribe ni limpia", async () => {
  const state = inValidation();
  save(state.key, state, dir);
  let cleaned = false;
  const lines = [];
  await watch(
    options({
      dryRun: true,
      ghRun: () => JSON.stringify({ state: "MERGED" }),
      cleanTask: async () => {
        cleaned = true;
      },
      out: (text) => lines.push(text),
    }),
  );
  assert.equal(load(state.key, dir).state, "In validation");
  assert.equal(cleaned, false);
  assert.match(lines.join("\n"), /la cerraría/);
});

test("un run.lock vivo impide el segundo arranque", async () => {
  save("ESN-1", inProgress(), dir);
  fs.writeFileSync(path.join(dir, "ESN-1", "run.lock"), String(process.pid));
  const calls = [];
  const lines = [];
  await watch(
    options({
      run: async (key) => {
        calls.push(key);
        return { ok: true };
      },
      out: (text) => lines.push(text),
    }),
  );
  assert.deepEqual(calls, []);
  assert.match(lines.join("\n"), /otro run/);
});

test("al mergear, mueve Linear a Done antes de limpiar", async () => {
  const state = inValidation();
  save(state.key, state, dir);
  const moves = [];
  const cleaned = [];
  await watch(
    options({
      ghRun: () => JSON.stringify({ state: "MERGED" }),
      issue: async (_apiKey, key) => ({
        id: "i1",
        identifier: key,
        team: { id: "t", key: "ESN" },
      }),
      move: async (_apiKey, issue, name) =>
        moves.push([issue.identifier, name]),
      cleanTask: async (key) => cleaned.push(key),
    }),
  );
  assert.deepEqual(moves, [["ESN-1", "Done"]]);
  assert.deepEqual(cleaned, ["ESN-1"]);
  assert.equal(load(state.key, dir).state, "Done");
});

test("si Linear falla, no cierra ni limpia", async () => {
  const state = inValidation();
  save(state.key, state, dir);
  const lines = [];
  let cleaned = false;
  await watch(
    options({
      ghRun: () => JSON.stringify({ state: "MERGED" }),
      move: async () => {
        throw new Error("Linear caído");
      },
      cleanTask: async () => {
        cleaned = true;
      },
      out: (text) => lines.push(text),
    }),
  );
  assert.equal(load(state.key, dir).state, "In validation");
  assert.equal(cleaned, false);
  assert.match(lines.join("\n"), /no pude cerrar en Linear.*Linear caído/);
});

test("Spec review con el bloque acordado pasa a Ready y lo borra", async () => {
  const marker = "<!-- orquestator-cli:acordado -->";
  const calls = [];
  await watch(
    options({
      specs: async () => [
        {
          id: "i1",
          identifier: "ESN-1",
          description: `Decidido.\n\n${marker}`,
          team: { id: "t", key: "ESN" },
        },
      ],
      move: async (_apiKey, _issue, name) => calls.push(["state", name]),
      edit: async (_apiKey, _issue, text) => calls.push(["desc", text]),
    }),
  );
  assert.deepEqual(calls, [
    ["state", "Ready"],
    ["desc", "Decidido."],
  ]);
});

test("Spec review sin bloque no se mueve", async () => {
  let moved = false;
  await watch(
    options({
      specs: async () => [
        {
          id: "i1",
          identifier: "ESN-1",
          description: "Sigo con dudas.",
          team: { id: "t", key: "ESN" },
        },
      ],
      move: async () => {
        moved = true;
      },
    }),
  );
  assert.equal(moved, false);
});

test("watch lanza spec-review y pasa a Ready si no hay preguntas", async () => {
  const issue = {
    id: "i1",
    identifier: "ESN-1",
    title: "Exportar",
    description: "Spec clara.",
    state: { name: "Spec review" },
    team: { id: "t", key: "ESN" },
  };
  const reviewed = [];
  const moved = [];
  const edited = [];
  await watch(
    options({
      specs: async () => [issue],
      issue: async () => issue,
      review: async (key) => {
        reviewed.push(key);
        return {
          artifact:
            "## Definición actual\n\nSpec final.\n\nSin preguntas: la spec está lista.",
        };
      },
      edit: async (_apiKey, _issue, text) => edited.push(text),
      move: async (_apiKey, _issue, name) => moved.push(name),
    }),
  );
  assert.deepEqual(reviewed, ["ESN-1"]);
  assert.deepEqual(edited, ["Spec final."]);
  assert.deepEqual(moved, ["Ready"]);
});

test("watch no repite el revisor hasta que cambia la descripción o hay comentario", async () => {
  let description = "Spec con dudas.";
  let comments = [];
  const issue = () => ({
    id: "i1",
    identifier: "ESN-1",
    title: "Exportar",
    description,
    comments: { nodes: comments },
    state: { name: "Spec review" },
    team: { id: "t", key: "ESN" },
  });
  let reviewed = 0;
  const run = () =>
    watch(
      options({
        specs: async () => [issue()],
        issue: async () => issue(),
        review: async () => {
          reviewed += 1;
          return { artifact: "Preguntas: ¿qué formato?" };
        },
      }),
    );
  await run();
  await run();
  assert.equal(reviewed, 1);
  comments = [{ id: "c1", body: "En A4." }];
  await run();
  assert.equal(reviewed, 2);
  await run();
  assert.equal(reviewed, 2);
  description = "Spec con dudas resueltas.";
  await run();
  assert.equal(reviewed, 3);
});

test("dry-run no mueve una spec acordada", async () => {
  let moved = false;
  const lines = [];
  await watch(
    options({
      dryRun: true,
      specs: async () => [
        {
          id: "i1",
          identifier: "ESN-1",
          description: "<!-- orquestator-cli:acordado -->",
          team: { id: "t", key: "ESN" },
        },
      ],
      move: async () => {
        moved = true;
      },
      out: (text) => lines.push(text),
    }),
  );
  assert.equal(moved, false);
  assert.match(lines.join("\n"), /la movería a Ready/);
});

test("watch exige max-parallel y el cerrojo no deja dos instancias", async () => {
  await assert.rejects(
    () => watch(options({ maxParallel: 0 })),
    /max-parallel/,
  );
  const release = watchLock(dir);
  assert.equal(typeof release, "function");
  assert.equal(watchLock(dir), null);
  release();
  const again = watchLock(dir);
  assert.equal(typeof again, "function");
  again();
});
