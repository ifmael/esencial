import fs from "node:fs";
import path from "node:path";
import { DOCKERFILE, imageTag, LOCKFILE, mirrorBlob } from "./image.mjs";
import { ensureImage } from "./image-build.mjs";
import { home } from "./state.mjs";
import { mirrorPath } from "./task.mjs";

export function parseBuildArgs(args = []) {
  const at = args.indexOf("--tag");
  if (at === -1) return { tag: null };
  const tag = args[at + 1];
  if (!tag || tag.startsWith("--")) {
    throw new Error(
      "--tag necesita un nombre de imagen (esencial-worker:<nombre>)",
    );
  }
  return { tag };
}

/** Ficheros del árbol que no coinciden con el main del espejo. */
export function treeMatchesMirror({
  cwd,
  mirror,
  files = [DOCKERFILE, LOCKFILE],
  read = fs.readFileSync,
  blob = mirrorBlob,
}) {
  const differs = [];
  for (const file of files) {
    const local = read(path.join(cwd, file));
    const remote = blob(mirror, file);
    if (!Buffer.from(local).equals(Buffer.from(remote))) differs.push(file);
  }
  return differs;
}

/**
 * Vía manual y de diagnóstico. Valida el árbol contra el espejo (salvo con
 * `--tag`, que construye a propósito), toma la misma cerradura que la vía
 * automática y se salta el freno de diez minutos: para eso existe.
 */
export async function manualBuild(
  args = [],
  {
    cwd = process.cwd(),
    base = home(),
    mirror = mirrorPath(base),
    out = () => {},
    ensure = ensureImage,
    ensureOptions = {},
  } = {},
) {
  const { tag: explicit } = parseBuildArgs(args);
  let tag = explicit;
  if (explicit) {
    out(`build.sh: --tag ${explicit}; no valido el árbol contra el espejo`);
  } else {
    tag = imageTag({ base, mirror, env: {} });
    const differs = treeMatchesMirror({ cwd, mirror });
    if (differs.length) {
      out(
        [
          "build.sh: el árbol no coincide con el main del espejo:",
          ...differs.map((file) => `  - ${file}`),
          "La imagen se construye con la receta del main del espejo; alinea la rama (git merge) o construye a propósito con --tag.",
          `Etiqueta del espejo ahora: ${tag}`,
        ].join("\n"),
      );
      return 1;
    }
  }
  await ensure(tag, {
    base,
    mirror,
    out,
    brake: false,
    force: true,
    // Sin `--tag` manda la receta del espejo: el contexto es su exportación. Con
    // `--tag` se construye a propósito desde el árbol (ahí está el Dockerfile que
    // se está arreglando).
    ...(explicit ? { context: cwd } : {}),
    dockerfile: DOCKERFILE,
    ...ensureOptions,
  });
  out(tag);
  return 0;
}
