import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SPEC_DIR = "spec-review";
export const SPEC_COMMENT = "<!-- orquestator-cli:spec-review -->";

export function specInputHash(issue) {
  const comments = (issue?.comments?.nodes ?? [])
    .filter((comment) => !String(comment.body ?? "").includes(SPEC_COMMENT))
    .map((comment) => `${comment.id ?? ""}\n${comment.body ?? ""}`)
    .join("\n---\n");
  const input = `${issue?.title ?? ""}\n${issue?.description ?? ""}\n${comments}`;
  return createHash("sha256").update(input).digest("hex");
}

/** Texto del artefacto sin bloques de código, donde también hay prosa. */
function withoutCode(text) {
  let fence = false;
  return text
    .split("\n")
    .filter((line) => {
      if (/^\s*```/.test(line)) {
        fence = !fence;
        return false;
      }
      return !fence;
    })
    .join("\n");
}

/** El revisor usa esta frase exacta cuando no tiene preguntas. */
export function specReady(artifact) {
  const text = withoutCode(String(artifact ?? ""));
  const section =
    /^##[ \t]+Preguntas[ \t]*$([\s\S]*?)(?=^##[ \t]|(?![\s\S]))/im.exec(text);
  return /Sin preguntas:\s*la spec está lista\.?/i.test(
    section ? section[1] : text,
  );
}

/** Bloque «Definición actual» del comentario del revisor. */
export function specDefinition(artifact) {
  const text = String(artifact ?? "");
  // El bloque acaba en el siguiente encabezado de nivel 2 o al final del artefacto:
  // `(?![\s\S])` es el fin de la entrada, porque `$` con flag `m` casa en cada línea.
  const match =
    /^##[ \t]+Definición actual[^\n]*\n([\s\S]*?)(?=^##[ \t]|(?![\s\S]))/im.exec(
      text,
    );
  if (!match) return null;
  const atEnd = match.index + match[0].length === text.length;
  const body = atEnd
    ? match[1].replace(/\n*Sin preguntas:\s*la spec está lista\.?\s*$/i, "")
    : match[1];
  return body.trim() || null;
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
