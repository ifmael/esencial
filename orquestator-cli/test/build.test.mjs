import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { manualBuild, treeMatchesMirror } from "../lib/build.mjs";
import { imageTag } from "../lib/image.mjs";
import { imageLockPath, readFailures } from "../lib/image-build.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

let dir;
let base;
let work;
let mirror;
let out;

function gitIn(cwd, ...args) {
  return execFileSync(
    "git",
    ["-c", "user.email=t@test", "-c", "user.name=Test", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function receta(dockerfile = "FROM x\n", lockfile = "lockfileVersion: 9\n") {
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-build-"));
  base = path.join(dir, "home");
  work = path.join(dir, "work");
  mirror = path.join(base, "upstream.git");
  out = [];
  fs.mkdirSync(base, { recursive: true });
  gitIn(dir, "init", "-q", "-b", "main", work);
  receta();
  execFileSync("git", ["clone", "-q", "--bare", work, mirror]);
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function options(overrides = {}) {
  return {
    cwd: work,
    base,
    mirror,
    out: (text) => out.push(text),
    ...overrides,
  };
}

test("con --tag no valida el árbol y construye a propósito", async () => {
  const ensured = [];
  const code = await manualBuild(
    ["--tag", "esencial-worker:manual"],
    options({
      ensure: async (tag, settings) => ensured.push({ tag, settings }),
    }),
  );
  assert.equal(code, 0);
  assert.equal(ensured[0].tag, "esencial-worker:manual");
  assert.equal(ensured[0].settings.brake, false);
  assert.equal(ensured[0].settings.force, true);
  assert.equal(ensured[0].settings.context, work);
  assert.equal(ensured[0].settings.dockerfile, "orquestator-cli/Dockerfile");
});

test("sin --tag valida contra el espejo y usa la etiqueta derivada", async () => {
  const ensured = [];
  const code = await manualBuild(
    [],
    options({ ensure: async (tag) => ensured.push(tag) }),
  );
  assert.equal(code, 0);
  assert.deepEqual(ensured, [imageTag({ base, mirror })]);
  assert.equal(out.at(-1), imageTag({ base, mirror }));
});

test("sin --tag, ORQUESTATOR_IMAGE no cambia la etiqueta derivada", async () => {
  const previous = process.env.ORQUESTATOR_IMAGE;
  process.env.ORQUESTATOR_IMAGE = "esencial-worker:forzada";
  try {
    const ensured = [];
    const code = await manualBuild(
      [],
      options({ ensure: async (tag) => ensured.push(tag) }),
    );
    assert.equal(code, 0);
    assert.deepEqual(ensured, [imageTag({ base, mirror, env: {} })]);
  } finally {
    if (previous === undefined) delete process.env.ORQUESTATOR_IMAGE;
    else process.env.ORQUESTATOR_IMAGE = previous;
  }
});

test("si el árbol no coincide con el espejo se para con mensaje", async () => {
  fs.writeFileSync(
    path.join(work, "orquestator-cli", "Dockerfile"),
    "FROM local\n",
  );
  const ensured = [];
  const code = await manualBuild(
    [],
    options({ ensure: async (tag) => ensured.push(tag) }),
  );
  assert.equal(code, 1);
  assert.deepEqual(ensured, []);
  assert.match(out.join("\n"), /no coincide/);
  assert.match(out.join("\n"), /orquestator-cli\/Dockerfile/);
  assert.match(out.join("\n"), /--tag/);
});

test("treeMatchesMirror compara los bytes de los dos ficheros", () => {
  assert.deepEqual(treeMatchesMirror({ cwd: work, mirror }), []);
  fs.writeFileSync(
    path.join(work, "pnpm-lock.yaml"),
    "lockfileVersion: 9\n# x",
  );
  assert.deepEqual(treeMatchesMirror({ cwd: work, mirror }), [
    "pnpm-lock.yaml",
  ]);
});

test("con un cerrojo de pid vivo, build.sh espera y luego construye", async () => {
  const tag = "esencial-worker:manual";
  const lockFile = imageLockPath(base, tag);
  fs.writeFileSync(lockFile, String(process.pid));
  const builds = [];
  let released = false;
  const docker = {
    async exists() {
      return false;
    },
    async build(settings) {
      builds.push({ settings, released });
      return { status: 0, stdout: "", stderr: "" };
    },
    async list() {
      return [];
    },
    async remove() {
      return { status: 0 };
    },
  };
  const code = await manualBuild(
    ["--tag", tag],
    options({
      ensureOptions: {
        docker,
        sleep: async () => {
          fs.rmSync(lockFile, { force: true });
          released = true;
        },
      },
    }),
  );
  assert.equal(code, 0);
  assert.match(out.join("\n"), /en curso/);
  assert.equal(builds.length, 1);
  assert.equal(builds[0].released, true);
});

test("Hermes queda fijado por commit en el Dockerfile", () => {
  const dockerfile = fs.readFileSync(
    path.join(REPO, "orquestator-cli", "Dockerfile"),
    "utf8",
  );
  assert.match(dockerfile, /^ARG HERMES_COMMIT=[0-9a-f]{40}$/m);
});

test("build.sh --tag construye con docker sin --build-arg", () => {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const argsFile = path.join(dir, "docker-args.txt");
  fs.writeFileSync(
    path.join(bin, "docker"),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> ${JSON.stringify(argsFile)}\nexit 0\n`,
    { mode: 0o755 },
  );
  execFileSync(
    "bash",
    [
      path.join(REPO, "orquestator-cli", "build.sh"),
      "--tag",
      "esencial-worker:manual",
    ],
    {
      cwd: REPO,
      env: {
        ...process.env,
        ORQUESTATOR_HOME: base,
        PATH: `${bin}:${process.env.PATH}`,
      },
    },
  );
  const args = fs.readFileSync(argsFile, "utf8");
  assert.match(args, /^build$/m);
  assert.match(args, /--tag\nesencial-worker:manual/);
  assert.match(args, /--file\n.+orquestator-cli\/Dockerfile/);
  assert.doesNotMatch(args, /--build-arg/);
});

test("dentro de la ventana del freno build.sh sí construye y limpia el marcador", () => {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const tag = "esencial-worker:manual";
  fs.writeFileSync(path.join(bin, "docker"), "#!/usr/bin/env bash\nexit 0\n", {
    mode: 0o755,
  });
  fs.writeFileSync(
    path.join(base, "image-fail.json"),
    JSON.stringify({
      [tag]: { at: Date.now(), error: "fallo previo", command: "docker build" },
    }),
  );
  execFileSync(
    "bash",
    [path.join(REPO, "orquestator-cli", "build.sh"), "--tag", tag],
    {
      cwd: REPO,
      env: {
        ...process.env,
        ORQUESTATOR_HOME: base,
        PATH: `${bin}:${process.env.PATH}`,
      },
    },
  );
  assert.equal(readFailures(base)[tag], undefined);
});

test("si el build manual falla, deja el marcador de la etiqueta", () => {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const tag = "esencial-worker:manual";
  fs.writeFileSync(
    path.join(bin, "docker"),
    "#!/usr/bin/env bash\necho 'ERROR: receta rota' >&2\nexit 1\n",
    { mode: 0o755 },
  );
  assert.throws(() =>
    execFileSync(
      "bash",
      [path.join(REPO, "orquestator-cli", "build.sh"), "--tag", tag],
      {
        cwd: REPO,
        env: {
          ...process.env,
          ORQUESTATOR_HOME: base,
          PATH: `${bin}:${process.env.PATH}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  assert.match(readFailures(base)[tag].error, /receta rota/);
});
