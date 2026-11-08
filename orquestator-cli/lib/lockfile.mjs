import fs from "node:fs";
import path from "node:path";

import { LOCKFILE, mirrorBlob, mirrorMissing } from "./image.mjs";

/**
 * Pares paquete+versión del lockfile de pnpm: las claves de `packages:`. Se
 * comparan como conjunto, sin Docker y sin resolver el grafo.
 */
export function packageKeys(text) {
  const keys = new Set();
  let inPackages = false;
  for (const line of String(text ?? "").split("\n")) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (/^\S/.test(line)) {
      inPackages = false;
      continue;
    }
    const match = /^ {2}(\S.*):\s*$/.exec(line);
    if (!match) continue;
    keys.add(match[1].replace(/^['"]|['"]$/g, ""));
  }
  return keys;
}

/** Pares que pide la rama y no existen en la receta de la imagen. */
export function lockfileMissing({ branch, recipe }) {
  const have = packageKeys(recipe);
  return [...packageKeys(branch)].filter((key) => !have.has(key)).sort();
}

/**
 * Puerta de lockfile: la imagen se hornea con el lockfile de `main` y la fase
 * instala con `--offline`, así que un par paquete+versión ausente de la receta
 * rompería la instalación. Se compara antes de lanzar cualquier instalación.
 */
export function lockfileGate({
  repo,
  mirror,
  file = LOCKFILE,
  read = fs.readFileSync,
  blob = mirrorBlob,
}) {
  const branch = read(path.join(repo, file), "utf8");
  let recipe;
  try {
    recipe = String(blob(mirror, file));
  } catch (error) {
    if (String(error.message).startsWith("Falta el espejo")) {
      throw new Error(mirrorMissing(mirror));
    }
    throw error;
  }
  const missing = lockfileMissing({ branch, recipe });
  if (missing.length === 0) return null;
  const error = new Error(
    [
      `El lockfile de la rama pide ${missing.length} par(es) paquete+versión que no están en la receta de la imagen (main del espejo):`,
      ...missing.map((key) => `  - ${key}`),
      "La imagen se hornea con el lockfile de main y la fase instala con --offline: la instalación fallaría.",
      "Alinea la rama con el main del espejo (git merge) antes de seguir; si la dependencia es nueva, tiene que entrar antes por main (docs/adr/0013).",
    ].join("\n"),
  );
  error.code = "LOCKFILE_DRIFT";
  error.missing = missing;
  throw error;
}
