// B' (dos despliegues): en local hacen falta DOS servidores, cada uno con su
// configuración de wrangler. `pnpm dev` arranca ambos y los para juntos
// (dev:api → puerto 8789, dev:web → 8787 con el SPA construido contra la API).
import { spawn } from "node:child_process";

const children = ["dev:api", "dev:web"].map((script) =>
  spawn("pnpm", ["run", script], { stdio: "inherit", env: process.env }),
);

let stopping = false;
function stop(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => stop(signal));
}
for (const child of children) {
  child.on("exit", (code) => {
    stop("SIGTERM");
    process.exit(code ?? 0);
  });
}
