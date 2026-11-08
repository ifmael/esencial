import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { home } from "./state.mjs";
import { mirrorPath } from "./task.mjs";

/** Nombre de la imagen; la etiqueta es la prueba de la receta. */
export const IMAGE_NAME = "esencial-worker";
export const DOCKERFILE = "orquestator-cli/Dockerfile";
export const LOCKFILE = "pnpm-lock.yaml";
export const MIRROR_REF = "refs/heads/main";

export function isMirror(mirror) {
  return fs.existsSync(path.join(mirror, "HEAD"));
}

export function mirrorMissing(mirror) {
  return `Falta el espejo ${mirror} (ejecuta orquestator start de una tarea y vuelve a probar)`;
}

/**
 * Bytes exactos de un fichero del `main` del espejo. Es la única fuente de lo
 * que se instala: etiqueta, puerta de lockfile y sonda RED leen de aquí.
 */
export function mirrorBlob(
  mirror,
  file,
  { exec = execFileSync, ref = MIRROR_REF } = {},
) {
  if (!isMirror(mirror)) throw new Error(mirrorMissing(mirror));
  try {
    return exec("git", ["--git-dir", mirror, "show", `${ref}:${file}`], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const detail = String(error.stderr ?? error.message ?? "").trim();
    throw new Error(
      `No pude leer ${file} del main del espejo (${mirror})${detail ? `: ${detail}` : ""}`,
    );
  }
}

/** La misma etiqueta que imprime `orquestator-cli/build.sh`. */
export function imageTag({
  base = home(),
  mirror = mirrorPath(base),
  env = process.env,
  blob = mirrorBlob,
} = {}) {
  if (env.ORQUESTATOR_IMAGE) return env.ORQUESTATOR_IMAGE;
  const hash = createHash("sha256");
  for (const file of [DOCKERFILE, LOCKFILE]) hash.update(blob(mirror, file));
  return `${IMAGE_NAME}:${hash.digest("hex").slice(0, 12)}`;
}
