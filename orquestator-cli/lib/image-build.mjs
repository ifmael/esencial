import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DOCKERFILE,
  imageTag,
  isMirror,
  MIRROR_REF,
  mirrorMissing,
} from "./image.mjs";
import { home } from "./state.mjs";
import { mirrorPath } from "./task.mjs";

/** Tope del proceso hijo de `docker build`: nada espera para siempre. */
export const BUILD_TIMEOUT_MS = 60 * 60 * 1000;
/** Margen de espera por encima del tope del que construye. */
export const BUILD_WAIT_MS = 5 * 60 * 1000;
/** Freno por etiqueta: no se reintenta un build fallido antes de diez minutos. */
export const FAIL_WINDOW_MS = 10 * 60 * 1000;
/** Anotación de la espera en el diario de la fase. */
export const ANNOTATE_MS = 60 * 1000;
/** Imágenes que se conservan por fecha de creación. */
export const KEEP_IMAGES = 3;

export class ImageError extends Error {
  constructor(message, { tag, command, cached = false } = {}) {
    super(message);
    this.name = "ImageError";
    this.tag = tag;
    this.command = command;
    this.cached = cached;
  }
}

function tail(text, lines = 6) {
  return String(text ?? "")
    .trimEnd()
    .split("\n")
    .slice(-lines)
    .join("\n");
}

function minutes(ms) {
  return Math.round(ms / 60000);
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export function slugTag(tag) {
  return String(tag).replace(/[^A-Za-z0-9_.-]+/g, "-");
}

export function imageLockPath(base = home(), tag) {
  return path.join(base, `image-${slugTag(tag)}.lock`);
}

/** Cerrojo con el pid dentro; un proceso muerto no bloquea. */
export function imageLock(base = home(), tag) {
  fs.mkdirSync(base, { recursive: true });
  const file = imageLockPath(base, tag);
  for (;;) {
    try {
      fs.writeFileSync(file, String(process.pid), {
        flag: "wx",
        mode: 0o600,
      });
      return () => fs.rmSync(file, { force: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let pid;
      try {
        pid = Number(fs.readFileSync(file, "utf8").trim());
      } catch {
        pid = NaN;
      }
      if (alive(pid)) return null;
      fs.rmSync(file, { force: true });
    }
  }
}

export function failPath(base = home()) {
  return path.join(base, "image-fail.json");
}

/** Fallos anotados por etiqueta; sobreviven al reinicio del servicio. */
export function readFailures(base = home()) {
  try {
    const data = JSON.parse(fs.readFileSync(failPath(base), "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    return {};
  }
}

function writeFailures(base, failures) {
  const file = failPath(base);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(failures, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(tmp, file);
}

export function noteFailure(base, tag, { at, error, command }) {
  const failures = readFailures(base);
  failures[tag] = { at, error, command };
  writeFailures(base, failures);
}

export function clearFailure(base, tag) {
  const failures = readFailures(base);
  if (!(tag in failures)) return;
  delete failures[tag];
  writeFailures(base, failures);
}

/** Proceso hijo con tope propio; el hijo que se pasa del tope se mata. */
export function runCommand(
  command,
  args,
  { spawnImpl = spawn, timeoutMs, input } = {},
) {
  return new Promise((resolve) => {
    const child = spawnImpl(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const cap = 4 * 1024 * 1024;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let killTimer;
    child.stdout?.on("data", (chunk) => {
      if (stdout.length < cap) stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < cap) stderr += chunk;
    });
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
          killTimer.unref?.();
        }, timeoutMs)
      : null;
    const done = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, timedOut, ...result });
    };
    child.on("error", (error) => {
      // Sin binario (o sin permiso) no hay stderr: el motivo va ahí.
      if (!stderr) stderr = String(error.message ?? error);
      done({ status: null, error });
    });
    child.on("close", (status, signal) => done({ status, signal }));
    if (input === undefined) child.stdin?.end();
    else child.stdin?.end(input);
  });
}

/** docker mínimo para la imagen; todo pasa por `run` para poder inyectarlo. */
export function dockerApi({ run = runCommand } = {}) {
  const repository = (tag) => String(tag).split(":")[0];
  return {
    async exists(tag) {
      const result = await run("docker", ["image", "inspect", tag]);
      return result.status === 0;
    },
    async build({ tag, dockerfile, context, timeoutMs }) {
      return run(
        "docker",
        ["build", "--tag", tag, "--file", dockerfile, context],
        { timeoutMs },
      );
    },
    async list(tag) {
      const result = await run("docker", [
        "image",
        "ls",
        "--filter",
        `reference=${repository(tag)}`,
        "--format",
        "{{.Repository}}:{{.Tag}}\t{{.CreatedAt}}",
      ]);
      if (result.status !== 0) {
        throw new Error(`docker image ls falló: ${tail(result.stderr, 1)}`);
      }
      return String(result.stdout ?? "")
        .split("\n")
        .filter((line) => line.includes("\t"))
        .map((line) => {
          const [name, createdAt] = line.split("\t");
          return { tag: name, createdAt: createdAt ?? "" };
        });
    },
    async remove(tag) {
      return run("docker", ["image", "rm", tag]);
    },
  };
}

/** Contexto de build: exportación del commit del espejo, no del árbol. */
export function exportMirror({
  mirror,
  dir,
  spawn: spawnImpl = spawnSync,
} = {}) {
  if (!isMirror(mirror)) throw new Error(mirrorMissing(mirror));
  const target =
    dir ?? fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-img-ctx-"));
  const archive = spawnImpl(
    "git",
    ["--git-dir", mirror, "archive", "--format=tar", MIRROR_REF],
    { encoding: "buffer", maxBuffer: 1024 * 1024 * 1024 },
  );
  if (archive.status !== 0) {
    fs.rmSync(target, { recursive: true, force: true });
    throw new Error(
      `No pude exportar el main del espejo: ${tail(
        String(archive.stderr ?? ""),
        2,
      )}`,
    );
  }
  const tar = spawnImpl("tar", ["-x", "-C", target], {
    input: archive.stdout,
    encoding: "buffer",
  });
  if (tar.status !== 0) {
    fs.rmSync(target, { recursive: true, force: true });
    throw new Error(
      `No pude descomprimir el contexto del build: ${tail(
        String(tar.stderr ?? ""),
        2,
      )}`,
    );
  }
  return {
    dir: target,
    cleanup: () => fs.rmSync(target, { recursive: true, force: true }),
  };
}

function buildCommandOf({ tag, dockerfile, context }) {
  return `docker build --tag ${tag} --file ${dockerfile} ${context}`;
}

function failureMessage({ tag, command, detail }) {
  return [
    `imagen: el build de ${tag} falló`,
    `  comando: ${command}`,
    `  error: ${detail || "(sin salida)"}`,
  ].join("\n");
}

/** Retención tras un build correcto: tres por fecha y la esperada protegida. */
async function retainImages(tag, { docker, out, keep }) {
  let images;
  try {
    images = await docker.list(tag);
  } catch (error) {
    out(
      `imagen: no pude listar las imágenes para la retención (${error.message})`,
    );
    return;
  }
  const ordered = [...images].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
  const keepTags = new Set([
    tag,
    ...ordered.slice(0, keep).map((one) => one.tag),
  ]);
  for (const image of ordered) {
    if (keepTags.has(image.tag)) continue;
    try {
      const result = await docker.remove(image.tag);
      if (result.status !== 0) {
        out(
          `imagen: no pude borrar ${image.tag} (${tail(result.stderr, 1) || `exit ${result.status}`})`,
        );
      }
    } catch (error) {
      out(`imagen: no pude borrar ${image.tag} (${error.message})`);
    }
  }
}

/**
 * La única función que garantiza la imagen: si existe vuelve; si hay un build
 * vivo espera; si no lo hay, toma el cerrojo y construye. La llaman el refresco
 * del servicio, la fase y el CLI manual.
 */
export async function ensureImage(
  tag,
  {
    base = home(),
    mirror = mirrorPath(base),
    out = () => {},
    docker = dockerApi(),
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    lock = imageLock,
    brake = true,
    force = false,
    context,
    dockerfile = DOCKERFILE,
    exportContext = exportMirror,
    buildTimeoutMs = BUILD_TIMEOUT_MS,
    failWindowMs = FAIL_WINDOW_MS,
    annotateMs = ANNOTATE_MS,
    waitTimeoutMs = buildTimeoutMs + BUILD_WAIT_MS,
    keep = KEEP_IMAGES,
  } = {},
) {
  if (brake) {
    const failure = readFailures(base)[tag];
    if (failure && now() - failure.at < failWindowMs) {
      throw new ImageError(failure.error, {
        tag,
        command: failure.command,
        cached: true,
      });
    }
  }
  const started = now();
  for (;;) {
    if (!force && (await docker.exists(tag))) return { tag, built: false };
    const release = lock(base, tag);
    if (release) {
      let work;
      try {
        if (!force && (await docker.exists(tag))) {
          return { tag, built: false };
        }
        work = context
          ? { dir: context, cleanup: () => {} }
          : exportContext({ mirror });
        const dockerfilePath = path.isAbsolute(dockerfile)
          ? dockerfile
          : path.join(work.dir, dockerfile);
        const command = buildCommandOf({
          tag,
          dockerfile: dockerfilePath,
          context: work.dir,
        });
        const result = await docker.build({
          tag,
          dockerfile: dockerfilePath,
          context: work.dir,
          timeoutMs: buildTimeoutMs,
        });
        if (result.timedOut) {
          const message = failureMessage({
            tag,
            command,
            detail: `el build superó el tope de ${minutes(buildTimeoutMs)} minutos; lo he matado`,
          });
          noteFailure(base, tag, { at: now(), error: message, command });
          throw new ImageError(message, { tag, command });
        }
        if (result.status !== 0) {
          const message = failureMessage({
            tag,
            command,
            detail: tail(result.stderr) || tail(result.stdout),
          });
          noteFailure(base, tag, { at: now(), error: message, command });
          throw new ImageError(message, { tag, command });
        }
        clearFailure(base, tag);
        await retainImages(tag, { docker, out, keep });
        return { tag, built: true };
      } finally {
        work?.cleanup();
        release();
      }
    }
    out(
      `imagen: hay un build de ${tag} en curso; espero (cerrojo ${imageLockPath(base, tag)})`,
    );
    if (now() - started >= waitTimeoutMs) {
      throw new ImageError(
        `imagen: el build de ${tag} sigue en curso tras ${minutes(waitTimeoutMs)} minutos; no espero más (cerrojo ${imageLockPath(base, tag)})`,
        { tag },
      );
    }
    await sleep(annotateMs);
  }
}

export function forcedImageMessage(tag, derived) {
  return [
    `imagen: ORQUESTATOR_IMAGE apunta a «${tag}», que no existe.`,
    "Opciones, y solo estas:",
    "  - quita ORQUESTATOR_IMAGE para que se construya la imagen de la receta actual",
    derived
      ? `  - pon ORQUESTATOR_IMAGE=${derived} (la etiqueta que sale del main del espejo ahora)`
      : "  - no hay espejo para calcular la etiqueta derivada: ejecuta start de una tarea",
    `  - constrúyela a mano: orquestator-cli/build.sh --tag ${tag}`,
  ].join("\n");
}

/**
 * Preflight de la fase: con `ORQUESTATOR_IMAGE` la imagen manda y no se
 * construye; sin la variable, `ensureImage` la garantiza. Nunca construye la
 * etiqueta forzada.
 */
export async function ensureReadyImage(
  tag,
  {
    base = home(),
    mirror = mirrorPath(base),
    forced = Boolean(process.env.ORQUESTATOR_IMAGE),
    out = () => {},
    docker = dockerApi(),
  } = {},
) {
  if (!forced) return ensureImage(tag, { base, mirror, out, docker });
  if (await docker.exists(tag)) return { tag, built: false, forced: true };
  let derived = null;
  try {
    derived = imageTag({ base, mirror, env: {} });
  } catch {
    derived = null;
  }
  throw new ImageError(forcedImageMessage(tag, derived), { tag });
}
