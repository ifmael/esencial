import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { ensureArtifactsAt } from "../lib/artifacts.mjs";
import {
  dockerArgs,
  dockerProblem,
  PHASES,
  preparePhase,
  runPhase,
} from "../lib/container.mjs";

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-ct-"));
  fs.mkdirSync(path.join(dir, "repo"));
  fs.mkdirSync(path.join(dir, "task"));
  fs.mkdirSync(path.join(dir, "upstream.git"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const paths = () => ({
  image: "esencial-worker:abc",
  repo: path.join(dir, "repo"),
  task: path.join(dir, "task"),
  upstream: path.join(dir, "upstream.git"),
  uid: 1000,
  gid: 1000,
});

test("dockerArgs monta el repo, el task en ro y el espejo en ro", () => {
  const args = dockerArgs({ phase: "check", ...paths() });
  const joined = args.join(" ");
  assert.match(joined, /-v .+repo:\/work /);
  assert.match(joined, /-v .+task:\/work\/.task:ro/);
  assert.match(joined, /-v .+upstream\.git:\/upstream:ro/);
  assert.match(joined, /--user 1000:1000/);
  assert.match(joined, /--cap-drop=ALL/);
});

test("cada fase monta en escritura solo sus ficheros", () => {
  assert.deepEqual(PHASES.check.rw, ["checks.md"]);
  assert.deepEqual(PHASES.implementer.rw, ["impl.md", "pr-body.md"]);
  assert.deepEqual(PHASES.reviewer.rw, ["review.md"]);
  assert.deepEqual(PHASES["pr-review"].rw, ["pr-review.md"]);
  for (const phase of Object.keys(PHASES)) {
    ensureArtifactsAt(paths().task);
    const args = dockerArgs({ phase, ...paths() }).join(" ");
    const root = PHASES[phase].taskRoot ?? "/work/.task";
    for (const name of PHASES[phase].rw) {
      assert.match(args, new RegExp(`task/${name}:${root}/${name}`));
    }
    assert.doesNotMatch(args, /state\.json/);
    assert.doesNotMatch(args, /upstream\.git:\/upstream`/);
  }
});

test("check va sin red; las fases de agente van por la red interna", () => {
  assert.match(
    dockerArgs({ phase: "check", ...paths() }).join(" "),
    /--network none/,
  );
  assert.match(
    dockerArgs({ phase: "implementer", ...paths() }).join(" "),
    /--network esencial-workers/,
  );
});

test("las fases de agente montan config, SOUL y skills sobre el home de la imagen", () => {
  const args = dockerArgs({ phase: "implementer", ...paths() }).join(" ");
  assert.match(
    args,
    /hermes\/implementer\/config\.yaml:\/opt\/hermes\/home\/config\.yaml:ro/,
  );
  assert.match(
    args,
    /hermes\/implementer\/SOUL\.md:\/opt\/hermes\/home\/SOUL\.md:ro/,
  );
  assert.match(args, /hermes\/implementer\/skills:\/skills:ro/);
  assert.match(
    args,
    /hermes\/implementer\/skills-local:\/opt\/hermes\/home\/skills/,
  );
  assert.match(args, /GIT_AUTHOR_NAME=orquestator/);
  assert.doesNotMatch(args, /HERMES_HOME=\/hermes-home/);
});

test("spec-review monta el repo en ro, sin espejo, y escribe sus preguntas", () => {
  ensureArtifactsAt(paths().task);
  const args = dockerArgs({ phase: "spec-review", ...paths() }).join(" ");
  assert.match(args, /repo:\/work:ro/);
  assert.doesNotMatch(args, /upstream\.git:\/upstream/);
  assert.match(args, /task:\/task:ro/);
  assert.match(args, /task\/spec-review\.md:\/task\/spec-review\.md/);
  assert.doesNotMatch(args, /\/work\/\.task/);
  assert.match(args, /--network esencial-workers/);
});

test("AGENTS.md de confianza se monta encima del clon en ro", () => {
  ensureArtifactsAt(paths().task);
  const file = path.join(dir, "AGENTS.md");
  fs.writeFileSync(file, "reglas");
  const args = dockerArgs({
    phase: "reviewer",
    ...paths(),
    agentsFile: file,
  }).join(" ");
  assert.match(args, /AGENTS\.md:\/work\/AGENTS\.md:ro/);
});

test("ensureArtifacts crea los ficheros que faltan sin pisar los llenos", () => {
  ensureArtifactsAt(paths().task);
  assert.ok(fs.existsSync(path.join(paths().task, "checks.md")));
  fs.writeFileSync(path.join(paths().task, "checks.md"), "hola");
  ensureArtifactsAt(paths().task);
  assert.equal(
    fs.readFileSync(path.join(paths().task, "checks.md"), "utf8"),
    "hola",
  );
});

test("dockerProblem explica el permiso denegado sin asumir el grupo", () => {
  const problem = dockerProblem({
    spawn: () => ({
      status: 1,
      stdout: "",
      stderr: "permission denied while trying to connect to the docker API",
    }),
  });
  assert.match(problem, /Docker no es accesible/);
  assert.match(problem, /permission denied/);
  assert.match(problem, /grupo docker/);
  assert.match(problem, /newgrp/);
});

test("dockerProblem devuelve null si Docker responde", () => {
  assert.equal(
    dockerProblem({
      spawn: () => ({ status: 0, stdout: "", stderr: "" }),
    }),
    null,
  );
});

test("runPhase sin Docker falla antes de lanzar el contenedor", async () => {
  await assert.rejects(
    () =>
      runPhase({
        phase: "check",
        ...paths(),
        command: "pnpm lint",
        dockerCheck: () => "Docker no es accesible: permission denied",
      }),
    /Docker no es accesible/,
  );
});

test("runPhase con dryRun no ejecuta docker y enseña el comando", async () => {
  const lines = [];
  const result = await runPhase({
    phase: "check",
    ...paths(),
    command: "pnpm lint",
    dryRun: true,
    out: (t) => lines.push(t),
  });
  assert.equal(result, null);
  assert.match(lines.join("\n"), /docker run/);
  assert.match(lines.join("\n"), /pnpm lint/);
  assert.doesNotMatch(lines.join("\n"), / -i /);
});

test("el dry-run enseña la etiqueta derivada del espejo", async () => {
  const source = path.join(dir, "source");
  fs.mkdirSync(path.join(source, "orquestator-cli"), { recursive: true });
  fs.writeFileSync(
    path.join(source, "orquestator-cli", "Dockerfile"),
    "FROM x\n",
  );
  fs.writeFileSync(path.join(source, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=T", ...args],
      {
        cwd: source,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("commit", "-q", "-m", "receta");
  execFileSync("git", [
    "clone",
    "-q",
    "--bare",
    source,
    path.join(dir, "upstream.git"),
  ]);
  const lines = [];
  const result = await runPhase({
    phase: "check",
    repo: paths().repo,
    task: paths().task,
    upstream: path.join(dir, "upstream.git"),
    base: dir,
    command: "pnpm lint",
    dryRun: true,
    out: (t) => lines.push(t),
  });
  assert.equal(result, null);
  assert.match(lines.join("\n"), /esencial-worker:[0-9a-f]{12}/);
  assert.doesNotMatch(lines.join("\n"), /imagen del espejo/);
});

test("runPhase exige que existan el clon, el task y el espejo", async () => {
  await assert.rejects(
    () =>
      runPhase({
        phase: "check",
        ...paths(),
        repo: path.join(dir, "nope"),
        dryRun: true,
      }),
    /clon/,
  );
});

test("runPhase pasa -i cuando hay prompt por stdin", async () => {
  const lines = [];
  await runPhase({
    phase: "reviewer",
    ...paths(),
    command: "hermes --query-file -",
    input: "prompt",
    dryRun: true,
    out: (t) => lines.push(t),
  });
  assert.match(lines.join("\n"), / --init .* -i /);
});

test("preparePhase abre la puerta de lockfile contra el espejo y garantiza la imagen", async () => {
  const gated = [];
  const ensured = [];
  const tag = await preparePhase({
    phase: "check",
    repo: paths().repo,
    upstream: paths().upstream,
    base: dir,
    image: "esencial-worker:abc",
    env: {},
    gate: (options) => gated.push(options),
    ensure: async (image, options) => ensured.push({ image, options }),
  });
  assert.equal(tag, "esencial-worker:abc");
  assert.deepEqual(gated, [{ repo: paths().repo, mirror: paths().upstream }]);
  assert.equal(ensured[0].image, "esencial-worker:abc");
  assert.equal(ensured[0].options.mirror, paths().upstream);
  assert.equal(ensured[0].options.forced, false);
});

test("spec-review no pasa por la puerta de lockfile, pero sí por la imagen", async () => {
  let gated = false;
  let ensured = 0;
  await preparePhase({
    phase: "spec-review",
    repo: dir,
    base: dir,
    image: "esencial-worker:abc",
    env: {},
    gate: () => {
      gated = true;
    },
    ensure: async () => {
      ensured += 1;
    },
  });
  assert.equal(gated, false);
  assert.equal(ensured, 1);
});

test("con ORQUESTATOR_IMAGE la puerta se desactiva y la imagen va forzada", async () => {
  let gated = false;
  const ensured = [];
  const tag = await preparePhase({
    phase: "check",
    repo: paths().repo,
    upstream: paths().upstream,
    base: dir,
    image: "esencial-worker:forzada",
    env: { ORQUESTATOR_IMAGE: "esencial-worker:forzada" },
    gate: () => {
      gated = true;
    },
    ensure: async (image, options) => ensured.push({ image, options }),
  });
  assert.equal(tag, "esencial-worker:forzada");
  assert.equal(gated, false);
  assert.equal(ensured[0].options.forced, true);
});
