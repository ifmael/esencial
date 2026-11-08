import { fetchMirror, git } from "./checkout.mjs";
import { imageTag } from "./image.mjs";
import { ensureImage } from "./image-build.mjs";
import { home } from "./state.mjs";
import { mirrorPath } from "./task.mjs";

/** Cada cuánto el servicio refresca el espejo y se asegura la imagen. */
export const REFRESH_MS = 5 * 60 * 1000;

/**
 * Refresco periódico del servicio: dos fetches (espejo y checkout) y, si no hay
 * etiqueta forzada, `ensureImage` en segundo plano. Los fetches no se saltan
 * con `ORQUESTATOR_IMAGE`: la variable cambia la imagen, no el origen de los
 * datos (la sonda RED y el preflight siguen leyendo el espejo).
 */
export async function refreshImage({
  base = home(),
  main = process.cwd(),
  mirror = mirrorPath(base),
  env = process.env,
  token,
  out = () => {},
  gitRun = git,
  ensure = ensureImage,
  tag = imageTag,
} = {}) {
  let source;
  try {
    source = gitRun(["remote", "get-url", "origin"], { cwd: main });
  } catch (error) {
    out(
      `imagen: no pude leer el remoto del checkout (${error.message}); sigo con el espejo que hay`,
    );
  }
  if (source !== undefined) {
    try {
      const options = { mirror, source, gitRun };
      if (token !== undefined) options.token = token;
      fetchMirror(options);
    } catch (error) {
      out(
        `imagen: no pude actualizar el espejo (${error.message}); sigo con el que hay`,
      );
    }
  }
  try {
    gitRun(["fetch", "--prune", "--no-tags", "origin"], { cwd: main });
  } catch (error) {
    out(`imagen: no pude actualizar el checkout (${error.message}); sigo`);
  }
  if (env.ORQUESTATOR_IMAGE) return { skipped: true };
  const image = tag({ base, mirror, env });
  return ensure(image, { base, mirror, out });
}
