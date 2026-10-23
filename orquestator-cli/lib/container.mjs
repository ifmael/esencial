import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ensureArtifactsAt } from "./artifacts.mjs";

export const NETWORK = "esencial-workers";

/** Qué escribe cada fase y con qué red corre. */
export const PHASES = {
  implementer: {
    rw: ["impl.md", "pr-body.md"],
    network: "model",
    home: true,
  },
  check: { rw: ["checks.md"], network: "none" },
  reviewer: { rw: ["review.md"], network: "model", home: true },
  "pr-review": { rw: ["pr-review.md"], network: "model", home: true },
};

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
    args.push("--network", NETWORK);
  }
  if (spec.home) {
    // HERMES_HOME aislado por fase: sesiones y caché de Hermes no se mezclan.
    const hermes = path.join(path.dirname(task), "hermes", phase);
    args.push(
      "-v",
      `${hermes}:/hermes-home`,
      "-e",
      "HERMES_HOME=/hermes-home",
      "-e",
      "GIT_AUTHOR_NAME=orquestator",
      "-e",
      "GIT_AUTHOR_EMAIL=orquestator@esencial.invalid",
      "-e",
      "GIT_COMMITTER_NAME=orquestator",
      "-e",
      "GIT_COMMITTER_EMAIL=orquestator@esencial.invalid",
    );
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
  input,
  dryRun,
  out = () => {},
}) {
  ensureArtifactsAt(task);
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
    input,
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
