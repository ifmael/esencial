import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** La misma etiqueta que imprime `orquestator-cli/build.sh`. */
export function imageTag({
  cwd = process.cwd(),
  dockerfile = "orquestator-cli/Dockerfile",
  lockfile = "pnpm-lock.yaml",
} = {}) {
  if (process.env.ORQUESTATOR_IMAGE) return process.env.ORQUESTATOR_IMAGE;
  const hash = createHash("sha256");
  for (const file of [dockerfile, lockfile]) {
    hash.update(fs.readFileSync(path.resolve(cwd, file)));
  }
  return `esencial-worker:${hash.digest("hex").slice(0, 12)}`;
}
