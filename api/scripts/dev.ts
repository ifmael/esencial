// B' (dos despliegues): en local hacen falta DOS servidores, cada uno con su
// configuración de wrangler. `pnpm dev` arranca ambos y los para juntos
// (dev:api → puerto 8789, dev:web → 8787 con el SPA construido contra la API).
// Con `ESENCIAL_HOST=<ip>` (p. ej. la IP de la LAN) los dos escuchan en esa IP
// (`--ip`) y los orígenes de la corrida —CORS, CSP y VITE_API_URL— pasan a esa
// IP: así se entra desde el móvil (misma red) por `http://<ip>:8787`.
import { spawn } from "node:child_process";

const host = process.env.ESENCIAL_HOST ?? "127.0.0.1";
const web = `http://${host}:8787`;
const api = `http://${host}:8789`;

const children = [
  spawn("pnpm", ["run", "dev:api"], {
    stdio: "inherit",
    env: { ...process.env, ESENCIAL_IP: host, WEB_ORIGIN: web },
  }),
  spawn("pnpm", ["run", "dev:web"], {
    stdio: "inherit",
    env: {
      ...process.env,
      ESENCIAL_IP: host,
      API_ORIGIN: api,
      VITE_API_URL: api,
    },
  }),
];

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
