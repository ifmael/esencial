import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { imageTag } from "../lib/image.mjs";
import {
  dockerApi,
  ensureImage,
  ensureReadyImage,
  imageLock,
  imageLockPath,
  noteFailure,
  readFailures,
  runCommand,
} from "../lib/image-build.mjs";

const TAG = "esencial-worker:abc123abc123";
const MINUTE = 60 * 1000;

let base;
let out;
let exported;

function fakeDocker(overrides = {}) {
  const calls = { exists: [], build: [], list: [], remove: [] };
  const docker = {
    calls,
    async exists(tag) {
      calls.exists.push(tag);
      if (Array.isArray(overrides.exists)) return overrides.exists.shift();
      return typeof overrides.exists === "function"
        ? overrides.exists(tag)
        : Boolean(overrides.exists);
    },
    async build(options) {
      calls.build.push(options);
      return overrides.build ?? { status: 0, stdout: "", stderr: "" };
    },
    async list(tag) {
      calls.list.push(tag);
      return overrides.list ?? [];
    },
    async remove(tag) {
      calls.remove.push(tag);
      return overrides.remove ?? { status: 0, stdout: "", stderr: "" };
    },
  };
  return docker;
}

function options(overrides = {}) {
  return {
    base,
    mirror: path.join(base, "upstream.git"),
    out: (text) => out.push(text),
    exportContext: () => {
      exported.push("export");
      return { dir: "/tmp/contexto", cleanup: () => exported.push("cleanup") };
    },
    ...overrides,
  };
}

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-ensure-"));
  out = [];
  exported = [];
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

test("si falta la imagen, la construye y libera el cerrojo", async () => {
  const docker = fakeDocker();
  const result = await ensureImage(TAG, options({ docker }));
  assert.equal(result.built, true);
  const call = docker.calls.build[0];
  assert.equal(call.tag, TAG);
  assert.equal(call.dockerfile, "/tmp/contexto/orquestator-cli/Dockerfile");
  assert.equal(call.context, "/tmp/contexto");
  assert.equal(call.timeoutMs, 60 * MINUTE);
  assert.deepEqual(exported, ["export", "cleanup"]);
  assert.equal(fs.existsSync(imageLockPath(base, TAG)), false);
});

test("si la imagen existe no construye ni exporta el contexto", async () => {
  const docker = fakeDocker({ exists: true });
  const result = await ensureImage(TAG, options({ docker }));
  assert.equal(result.built, false);
  assert.deepEqual(docker.calls.build, []);
  assert.deepEqual(exported, []);
});

test("un build fallido deja etiqueta, comando y final del error", async () => {
  const docker = fakeDocker({
    build: { status: 1, stdout: "", stderr: "steps 1/4\nERROR: no space left" },
  });
  await assert.rejects(
    () => ensureImage(TAG, options({ docker })),
    (error) => {
      assert.match(error.message, new RegExp(TAG));
      assert.match(error.message, /docker build --tag/);
      assert.match(error.message, /no space left/);
      assert.match(error.message, /contexto: exportación/);
      return true;
    },
  );
  const saved = readFailures(base)[TAG];
  assert.ok(saved, "el fallo queda anotado");
  assert.match(saved.error, /no space left/);
  assert.match(saved.command, new RegExp(TAG));
  assert.equal(typeof saved.at, "number");
  assert.equal(fs.existsSync(imageLockPath(base, TAG)), false);
});

test("dentro de diez minutos no reintenta: devuelve el error guardado sin docker", async () => {
  const failing = fakeDocker({
    build: { status: 1, stdout: "", stderr: "ERROR: fallo de red" },
  });
  await assert.rejects(() => ensureImage(TAG, options({ docker: failing })));

  // Servicio nuevo (otro proceso, mismo HOME): lee el marcador del disco.
  const fresh = fakeDocker();
  await assert.rejects(
    () => ensureImage(TAG, options({ docker: fresh })),
    (error) => {
      assert.match(error.message, /fallo de red/);
      assert.equal(error.cached, true);
      return true;
    },
  );
  assert.deepEqual(fresh.calls, {
    exists: [],
    build: [],
    list: [],
    remove: [],
  });
});

test("a los diez minutos reintenta una vez y un éxito limpia el marcador", async () => {
  const first = fakeDocker({
    build: { status: 1, stdout: "", stderr: "ERROR: fallo" },
  });
  await assert.rejects(() =>
    ensureImage(TAG, options({ docker: first, now: () => 1000 })),
  );
  assert.ok(readFailures(base)[TAG]);

  const later = fakeDocker();
  const result = await ensureImage(
    TAG,
    options({ docker: later, now: () => 1000 + 10 * MINUTE + 1 }),
  );
  assert.equal(result.built, true);
  assert.equal(later.calls.build.length, 1);
  assert.equal(readFailures(base)[TAG], undefined);
});

test("con un build vivo espera con anotación y no construye", async () => {
  const lockFile = imageLockPath(base, TAG);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(lockFile, String(process.pid));
  let built = false;
  const docker = fakeDocker({ exists: () => built });
  const sleeps = [];
  const result = await ensureImage(
    TAG,
    options({
      docker,
      sleep: async () => {
        sleeps.push("espera");
        fs.rmSync(lockFile, { force: true });
        built = true;
      },
    }),
  );
  assert.equal(result.built, false);
  assert.equal(sleeps.length, 1);
  assert.deepEqual(docker.calls.build, []);
  assert.match(out.join("\n"), /en curso/);
});

test("un caller que esperaba hereda el fallo del build y no construye", async () => {
  const lockFile = imageLockPath(base, TAG);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(lockFile, String(process.pid));
  const docker = fakeDocker();
  const sleeps = [];
  await assert.rejects(
    () =>
      ensureImage(
        TAG,
        options({
          docker,
          now: () => 1000,
          sleep: async () => {
            sleeps.push("espera");
            // El build que tenía el cerrojo falla y lo suelta: marcador escrito.
            noteFailure(base, TAG, {
              at: 1000,
              error: `imagen: el build de ${TAG} falló`,
              command: `docker build --tag ${TAG}`,
            });
            fs.rmSync(lockFile, { force: true });
          },
        }),
      ),
    (error) => {
      assert.equal(error.cached, true);
      assert.match(error.message, /falló/);
      return true;
    },
  );
  assert.equal(sleeps.length, 1);
  assert.deepEqual(docker.calls.build, []);
  assert.deepEqual(docker.calls.exists, [TAG]);
});

test("si el fallo aparece al tomar el cerrojo, no construye", async () => {
  const docker = fakeDocker();
  await assert.rejects(
    () =>
      ensureImage(
        TAG,
        options({
          docker,
          now: () => 1000,
          lock: () => {
            noteFailure(base, TAG, {
              at: 1000,
              error: `imagen: el build de ${TAG} falló`,
              command: `docker build --tag ${TAG}`,
            });
            return () => {};
          },
        }),
      ),
    (error) => {
      assert.equal(error.cached, true);
      return true;
    },
  );
  assert.deepEqual(docker.calls.build, []);
});

test("un cerrojo huérfano (pid muerto) se toma y se construye", async () => {
  const lockFile = imageLockPath(base, TAG);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(lockFile, "999999");
  const docker = fakeDocker();
  const result = await ensureImage(TAG, options({ docker }));
  assert.equal(result.built, true);
  assert.equal(fs.existsSync(lockFile), false);
});

test("el build se corta a los sesenta minutos y anota el fallo", async () => {
  const docker = fakeDocker({
    build: { status: null, stdout: "", stderr: "", timedOut: true },
  });
  await assert.rejects(
    () => ensureImage(TAG, options({ docker })),
    /60 minutos/,
  );
  assert.ok(readFailures(base)[TAG]);
  assert.equal(fs.existsSync(imageLockPath(base, TAG)), false);
});

test("tras un build correcto retiene tres imágenes y protege la esperada", async () => {
  const docker = fakeDocker({
    list: [
      { tag: TAG, createdAt: "2026-11-01 09:00:00 +0000 UTC" },
      { tag: "esencial-worker:a", createdAt: "2026-11-02 09:00:00 +0000 UTC" },
      { tag: "esencial-worker:b", createdAt: "2026-11-03 09:00:00 +0000 UTC" },
      { tag: "esencial-worker:c", createdAt: "2026-11-04 09:00:00 +0000 UTC" },
      { tag: "esencial-worker:d", createdAt: "2026-11-05 09:00:00 +0000 UTC" },
    ],
  });
  await ensureImage(TAG, options({ docker }));
  assert.deepEqual(docker.calls.remove, ["esencial-worker:a"]);
});

test("un rm fallido se registra sin tumbar la entrega", async () => {
  const docker = fakeDocker({
    list: [
      { tag: "esencial-worker:a", createdAt: "2026-11-02 09:00:00 +0000 UTC" },
      { tag: "esencial-worker:b", createdAt: "2026-11-03 09:00:00 +0000 UTC" },
      { tag: "esencial-worker:c", createdAt: "2026-11-04 09:00:00 +0000 UTC" },
      { tag: "esencial-worker:d", createdAt: "2026-11-05 09:00:00 +0000 UTC" },
    ],
    remove: {
      status: 1,
      stdout: "",
      stderr: "image is being used by running container",
    },
  });
  const result = await ensureImage(TAG, options({ docker }));
  assert.equal(result.built, true);
  assert.match(out.join("\n"), /no pude borrar/);
  assert.match(out.join("\n"), /in use|being used/);
});

test("la etiqueta forzada inexistente ofrece solo las tres salidas reales", async () => {
  const work = path.join(base, "work");
  const mirror = path.join(base, "upstream.git");
  fs.mkdirSync(path.join(work, "orquestator-cli"), { recursive: true });
  fs.writeFileSync(
    path.join(work, "orquestator-cli", "Dockerfile"),
    "FROM x\n",
  );
  fs.writeFileSync(path.join(work, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=T", ...args],
      {
        cwd: work,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("commit", "-q", "-m", "receta");
  execFileSync("git", ["clone", "-q", "--bare", work, mirror]);
  const derived = imageTag({ base, mirror, env: {} });

  const docker = fakeDocker();
  await assert.rejects(
    () =>
      ensureReadyImage("esencial-worker:forzada", {
        base,
        mirror,
        forced: true,
        docker,
        out: () => {},
      }),
    (error) => {
      assert.match(error.message, /ORQUESTATOR_IMAGE/);
      assert.match(error.message, new RegExp(derived));
      assert.match(error.message, /build\.sh --tag esencial-worker:forzada/);
      assert.match(error.message, /quita ORQUESTATOR_IMAGE/);
      return true;
    },
  );
  assert.deepEqual(docker.calls.build, []);
});

test("con etiqueta forzada existente no construye", async () => {
  const docker = fakeDocker({ exists: true });
  const result = await ensureReadyImage("esencial-worker:forzada", {
    base,
    forced: true,
    docker,
    out: () => {},
  });
  assert.deepEqual(result, {
    tag: "esencial-worker:forzada",
    built: false,
    forced: true,
  });
  assert.deepEqual(docker.calls.build, []);
});

test("el comando de build no lleva --build-arg ni secretos", async () => {
  const seen = [];
  const api = dockerApi({
    run: async (...args) => {
      seen.push(args);
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  await api.build({
    tag: TAG,
    dockerfile: "orquestator-cli/Dockerfile",
    context: "/tmp/contexto",
    timeoutMs: 1234,
  });
  const [command, args, config] = seen[0];
  assert.equal(command, "docker");
  assert.deepEqual(args, [
    "build",
    "--tag",
    TAG,
    "--file",
    "orquestator-cli/Dockerfile",
    "/tmp/contexto",
  ]);
  assert.equal(config.timeoutMs, 1234);
  assert.ok(!args.some((arg) => String(arg).startsWith("--build-arg")));
  assert.ok(!args.join(" ").includes("SECRET"));
});

test("runCommand marca tiempo agotado cuando el tope mata al hijo", async () => {
  const spawnImpl = () => {
    const listeners = {};
    return {
      stdout: { on() {} },
      stderr: { on() {} },
      stdin: { end() {} },
      on(event, fn) {
        listeners[event] = fn;
      },
      kill(signal) {
        listeners.close?.(null, signal);
      },
    };
  };
  const result = await runCommand("docker", ["build"], {
    timeoutMs: 5,
    spawnImpl,
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.status, null);
});

test("runCommand conserva el final de la salida cuando supera el tope", async () => {
  const spawnImpl = () => {
    const listeners = { stdout: [], stderr: [] };
    const child = {
      stdout: {
        on(_, fn) {
          listeners.stdout.push(fn);
        },
      },
      stderr: {
        on(_, fn) {
          listeners.stderr.push(fn);
        },
      },
      stdin: { end() {} },
      on(event, fn) {
        child.handlers[event] = fn;
      },
      handlers: {},
      kill() {},
    };
    setTimeout(() => {
      for (const fn of listeners.stderr) fn(Buffer.from("x".repeat(20)));
      for (const fn of listeners.stderr) fn(Buffer.from("ERROR: al final"));
      child.handlers.close?.(0, null);
    }, 0);
    return child;
  };
  const result = await runCommand("docker", ["build"], {
    spawnImpl,
    captureLimit: 10,
  });
  assert.equal(result.stderr.length, 10);
  assert.match(result.stderr, /al final/);
});

test("el cerrojo por etiqueta no deja dos escritores", () => {
  const first = imageLock(base, TAG);
  assert.equal(typeof first, "function");
  assert.equal(imageLock(base, TAG), null);
  first();
  const again = imageLock(base, TAG);
  assert.equal(typeof again, "function");
  again();
});
