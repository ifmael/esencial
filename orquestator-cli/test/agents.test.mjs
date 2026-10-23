import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  effortFor,
  hermesCommand,
  modelFor,
  promptFor,
  runAgent,
  verdictOf,
} from "../lib/agents.mjs";
import { writeArtifact } from "../lib/artifacts.mjs";
import { createState, save, transition } from "../lib/state.mjs";

let dir;
let task;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-agt-"));
  fs.mkdirSync(path.join(dir, "ESN-7", "repo"), { recursive: true });
  fs.mkdirSync(path.join(dir, "ESN-7", "task"), { recursive: true });
  fs.mkdirSync(path.join(dir, "upstream.git"));
  task = path.join(dir, "ESN-7", "task");
  writeArtifact("ESN-7", "brief.md", "# ESN-7 — Algo\n\nHaz X.", dir);
  writeArtifact("ESN-7", "checks.md", "Resultado: PASS", dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function started(state = "In Progress") {
  save(
    "ESN-7",
    transition({ ...createState("ESN-7"), branch: "ESN-7-x" }, state),
    dir,
  );
}

test("el comando de Hermes es one-shot y escribe la salida en el artefacto", () => {
  const command = hermesCommand("qwen3.8-flash", "review.md");
  assert.match(command, /hermes chat --oneshot -Q --yolo/);
  assert.doesNotMatch(command, /--safe-mode/);
  assert.match(
    command,
    /--provider custom --base-url http:\/\/esencial-proxy:8080\/v1/,
  );
  assert.match(command, /--model qwen3\.8-flash/);
  assert.match(command, /--query-file -/);
  assert.match(command, /> \/work\/\.task\/review\.md$/);
});

test("el prompt lleva el perfil, el brief y solo el contexto de la fase", () => {
  const reviewer = promptFor("reviewer", {
    brief: "# ESN-7 — Algo",
    impl: "cambié cosas",
    checks: "Resultado: PASS",
    diff: "diff --git a/x b/x",
  });
  assert.match(reviewer, /Perfil: revisor/);
  assert.match(reviewer, /## brief/);
  assert.match(reviewer, /## impl/);
  assert.match(reviewer, /## diff frente a main/);
  assert.match(reviewer, /diff --git/);

  const implementer = promptFor("implementer", {
    brief: "brief",
    "human-feedback": "corrige esto",
    checks: "FAIL",
    review: "CAMBIOS",
    "pr-review": "",
  });
  assert.match(implementer, /Perfil: implementador/);
  assert.match(implementer, /corrige esto/);
  assert.doesNotMatch(implementer, /diff frente a main/);
});

test("runAgent lanza la fase con su modelo, su prompt por stdin y lee el artefacto", () => {
  started();
  let seen;
  const result = runAgent("ESN-7", {
    phase: "reviewer",
    base: dir,
    diff: "diff --git a/x b/x",
    runner: (options) => {
      seen = options;
      fs.writeFileSync(
        path.join(task, "review.md"),
        "Veredicto: APROBADO\n\nsin hallazgos\n",
      );
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(result.artifact, "Veredicto: APROBADO\n\nsin hallazgos\n");
  assert.equal(seen.phase, "reviewer");
  assert.match(seen.command, /--model qwen3\.8-flash/);
  assert.match(seen.command, /> \/work\/\.task\/review\.md/);
  assert.match(seen.input, /Perfil: revisor/);
  assert.match(seen.input, /## checks/);
  assert.match(seen.input, /diff --git/);
  const config = fs.readFileSync(
    path.join(dir, "ESN-7", "hermes", "reviewer", "config.yaml"),
    "utf8",
  );
  assert.match(config, /provider: custom/);
  assert.match(config, /default: qwen3\.8-flash/);
  assert.match(config, /base_url: http:\/\/esencial-proxy:8080\/v1/);
  assert.match(config, /reasoning_effort: max/);
});

test("un artefacto vacío o un fallo de Hermes no pasan", () => {
  started();
  assert.throws(
    () =>
      runAgent("ESN-7", {
        phase: "reviewer",
        base: dir,
        diff: "",
        runner: () => ({ status: 0, stdout: "", stderr: "" }),
      }),
    /vacío/,
  );
  assert.throws(
    () =>
      runAgent("ESN-7", {
        phase: "reviewer",
        base: dir,
        diff: "",
        runner: () => ({ status: 1, stdout: "", stderr: "sin cuota" }),
      }),
    /falló \(exit 1\).*sin cuota/s,
  );
});

test("pr-review solo corre con la tarea en In validation", () => {
  started();
  assert.throws(
    () =>
      runAgent("ESN-7", {
        phase: "pr-review",
        base: dir,
        diff: "",
        runner: () => {
          throw new Error("no se llama");
        },
      }),
    /no corre con la tarea en In Progress/,
  );
});

test("dry-run enseña el comando y no crea el HERMES_HOME", () => {
  started();
  const lines = [];
  const result = runAgent("ESN-7", {
    phase: "reviewer",
    base: dir,
    dryRun: true,
    out: (t) => lines.push(t),
  });
  assert.equal(result.dryRun, true);
  assert.match(lines.join("\n"), /--model qwen3\.8-flash/);
  assert.match(result.prompt, /\(dry-run\)/);
  assert.equal(fs.existsSync(path.join(dir, "ESN-7", "hermes")), false);
});

test("modelo y esfuerzo salen del perfil y se validan", () => {
  assert.equal(modelFor("implementer"), "deepseek-v4-flash");
  assert.equal(effortFor("implementer"), "xhigh");
  assert.equal(effortFor("pr-review"), "ultra");
  process.env.ORQUESTATOR_MODEL_REVIEWER = "glm5.3-flash";
  process.env.ORQUESTATOR_EFFORT_REVIEWER = "low";
  try {
    assert.equal(modelFor("reviewer"), "glm5.3-flash");
    assert.equal(effortFor("reviewer"), "low");
    process.env.ORQUESTATOR_MODEL_REVIEWER = "modelo; rm -rf /";
    process.env.ORQUESTATOR_EFFORT_REVIEWER = "brutal";
    assert.throws(() => modelFor("reviewer"), /Modelo inválido/);
    assert.throws(() => effortFor("reviewer"), /Esfuerzo inválido/);
  } finally {
    delete process.env.ORQUESTATOR_MODEL_REVIEWER;
    delete process.env.ORQUESTATOR_EFFORT_REVIEWER;
  }
});

test("verdictOf lee el veredicto y devuelve null si falta", () => {
  assert.equal(verdictOf("Veredicto: APROBADO\nok"), "APROBADO");
  assert.equal(verdictOf("texto\n`Veredicto: CAMBIOS`\n"), "CAMBIOS");
  assert.equal(verdictOf("sin veredicto"), null);
});
