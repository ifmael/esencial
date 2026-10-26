import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SPEC_DIR = "spec-review";

export function specInputHash(issue) {
  const input = `${issue?.title ?? ""}\n${issue?.description ?? ""}`;
  return createHash("sha256").update(input).digest("hex");
}

/** El revisor usa esta frase exacta cuando no tiene preguntas. */
export function specReady(artifact) {
  return /Sin preguntas:\s*la spec está lista\.?/i.test(String(artifact ?? ""));
}

export function specMarkerPath(base, key) {
  const safe = String(key).replace(/[^A-Za-z0-9-]/g, "_");
  return path.join(base, SPEC_DIR, `${safe}.json`);
}

export function readSpecMarker(base, key) {
  try {
    return JSON.parse(fs.readFileSync(specMarkerPath(base, key), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function writeSpecMarker(base, key, data) {
  const file = specMarkerPath(base, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  return data;
}
