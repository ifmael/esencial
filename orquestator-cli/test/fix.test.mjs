import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { readArtifact } from "../lib/artifacts.mjs";
import { fixTask } from "../lib/fix.mjs";
import { createState, load, save, transition } from "../lib/state.mjs";

const KEY = "ESN-7";
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-fix-"));
  process.env.ORQUESTATOR_HOME = dir;
});
afterEach(() => {
  delete process.env.ORQUESTATOR_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

function inProgress(extra = {}) {
  const state = transition({ ...createState(KEY), ...extra }, "In Progress");
  save(KEY, state, dir);
  return state;
}

test("fix desde In validation vuelve a In Progress y cuenta la ronda", () => {
  const state = transition(inProgress(), "In validation");
  save(KEY, state, dir);
  const result = fixTask(KEY, { origin: "checks" });
  assert.equal(result.state.state, "In Progress");
  assert.equal(load(KEY, dir).rounds.checks, 1);
});

test("fix desde In Progress no transiciona pero cuenta", () => {
  inProgress();
  const result = fixTask(KEY, { origin: "review" });
  assert.equal(result.state.state, "In Progress");
  assert.equal(load(KEY, dir).rounds.review, 1);
});

test("al agotar las rondas de review bloquea con la pregunta", () => {
  const state = {
    ...createState(KEY),
    rounds: { checks: 0, review: 3, prReview: 0 },
  };
  save(KEY, transition(state, "In Progress"), dir);
  const result = fixTask(KEY, { origin: "review" });
  assert.equal(result.blocked, true);
  const saved = load(KEY, dir);
  assert.equal(saved.state, "Blocked");
  assert.match(saved.question, /review agotadas/);
});

test("las rondas humanas no gastan las del agente y guardan el feedback", () => {
  const state = inProgress({ pr: { number: 9, url: "u" } });
  const ghRun = (args) => {
    if (args[0] === "api" && args[1] === "user")
      return JSON.stringify({ login: "duena" });
    if (args[1] === "view") {
      return JSON.stringify({
        comments: [
          { author: { login: "duena" }, body: "cambia el texto" },
          { author: { login: "otro" }, body: "yo opino" },
        ],
      });
    }
    return "";
  };
  const result = fixTask(KEY, { origin: "humano", ghRun });
  assert.equal(result.blocked, false);
  assert.equal(result.state.state, "In Progress");
  assert.equal(load(KEY, dir).rounds.human, 1);
  assert.equal(load(KEY, dir).rounds.review, 0);
  const feedback = readArtifact(KEY, "human-feedback.md", dir);
  assert.match(feedback, /cambia el texto/);
  assert.doesNotMatch(feedback, /yo opino/);
  assert.equal(state.state, "In Progress");
});

test("fix en dry-run no escribe nada", () => {
  inProgress();
  const result = fixTask(KEY, {
    origin: "checks",
    dryRun: true,
    out: () => {},
  });
  assert.equal(result.dryRun, true);
  assert.equal(load(KEY, dir).rounds.checks, 0);
});

test("fix exige una tarea en curso o en validación", () => {
  save(KEY, createState(KEY), dir);
  assert.throws(() => fixTask(KEY, { origin: "checks" }), /Ready/);
});
