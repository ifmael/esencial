import fs from "node:fs";
import path from "node:path";

import { dirFor, home } from "./state.mjs";

/** Ficheros de la tarea; cada fase escribe solo el suyo. */
export const ARTIFACTS = [
  "brief.md",
  "impl.md",
  "checks.md",
  "review.md",
  "pr-review.md",
  "pr-body.md",
  "human-feedback.md",
];

export function artifactsDir(key, base = home()) {
  return path.join(dirFor(key, base), "task");
}

/** Crea los ficheros que falten; nunca pisa lo que ya hay. */
export function ensureArtifactsAt(task) {
  fs.mkdirSync(task, { recursive: true });
  for (const name of ARTIFACTS) {
    const file = path.join(task, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, "");
  }
}

export function ensureArtifacts(key, base = home()) {
  ensureArtifactsAt(artifactsDir(key, base));
}

export function artifactPath(key, name, base = home()) {
  if (!ARTIFACTS.includes(name)) {
    throw new Error(
      `Artefacto desconocido: ${name} (válidos: ${ARTIFACTS.join(", ")})`,
    );
  }
  return path.join(artifactsDir(key, base), name);
}

export function readArtifact(key, name, base = home()) {
  const file = artifactPath(key, name, base);
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(`Artefacto no existe: ${name} (${file})`);
    throw error;
  }
}

export function writeArtifact(key, name, text, base = home()) {
  const file = artifactPath(key, name, base);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

export function listArtifacts(key, base = home()) {
  return ARTIFACTS.map((name) => {
    const file = path.join(artifactsDir(key, base), name);
    return { name, filled: fs.existsSync(file) && fs.statSync(file).size > 0 };
  });
}
