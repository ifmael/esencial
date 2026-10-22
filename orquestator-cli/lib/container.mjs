import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ARTIFACTS } from "./task.mjs";

export const NETWORK = "esencial-workers";

/** Qué escribe cada fase y con qué red corre. */
export const PHASES = {
  implementer: { rw: ["impl.md", "pr-body.md"], network: "model" },
  check: { rw: ["checks.md"], network: "none" },
  reviewer: { rw: ["review.md"], network: "model" },
  "pr-review": { rw: ["pr-review.md"], network: "model" },
};

export function ensureArtifacts(task) {
  fs.mkdirSync(task, { recursive: true });
  for (const name of ARTIFACTS) {
    const file = path.join(task, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, "");
  }
}

function exists(label, target) {
  if (!fs.existsSync(target)) throw new Error(`Falta ${label}: ${target}`);
}

export function dockerArgs({ phase, image, repo, task, upstream, uid, gid }) {
  const spec = PHASES[phase];
  if (!spec)
    throw new Error(
      `Fase desconocida: ${phase} (${Object.keys(PHASES).join(", ")})`,
    );
  exists("el clon", repo);
  exists("el task", task);
  exists("el espejo", upstream);
  const user = `${uid ?? process.getuid?.() ?? 1000}:${gid ?? process.getgid?.() ?? 1000}`;
  const args = [
    "run",
    "--rm",
    "--init",
    "--shm-size=1g",
    "-v",
    `${repo}:/work`,
    "-w",
    "/work",
    "-v",
    `${task}:/work/.task:ro`,
    "-v",
    `${upstream}:/upstream:ro`,
  ];
  for (const name of spec.rw) {
    args.push("-v", `${path.join(task, name)}:/work/.task/${name}`);
  }
  args.push(
    "--user",
    user,
    "--cpus",
    "4",
    "--memory",
    "8g",
    "--pids-limit",
    "2048",
    "--cap-drop=ALL",
    "--security-opt",
    "no-new-privileges",
  );
  if (spec.network === "none") {
    args.push("--network", "none");
  } else {
    args.push("--network", NETWORK, "-e", "HERMES_HOME=/opt/hermes/home");
  }
  args.push(image);
  return args;
}

export function runPhase({
  phase,
  image,
  repo,
  task,
  upstream,
  command,
  dryRun,
  out = () => {},
}) {
  ensureArtifacts(task);
  const args = dockerArgs({ phase, image, repo, task, upstream });
  const argv = [...args, "bash", "-lc", command];
  if (dryRun) {
    out(
      `[dry-run] docker ${argv.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`,
    );
    return null;
  }
  const result = spawnSync("docker", argv, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error)
    throw new Error(`No se pudo ejecutar docker: ${result.error.message}`);
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
