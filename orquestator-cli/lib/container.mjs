import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ensureArtifactsAt } from "./artifacts.mjs";

export const NETWORK = "esencial-workers";

/** Qué escribe cada fase y con qué red corre. */
export const PHASES = {
  "spec-review": {
    rw: ["spec-review.md"],
    network: "model",
    home: true,
    repo: "ro",
    upstream: false,
    taskRoot: "/task",
  },
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

export function dockerArgs({
  phase,
  image,
  repo,
  task,
  upstream,
  uid,
  gid,
  agentsFile,
}) {
  const spec = PHASES[phase];
  if (!spec)
    throw new Error(
      `Fase desconocida: ${phase} (${Object.keys(PHASES).join(", ")})`,
    );
  exists("el clon", repo);
  exists("el task", task);
  if (spec.upstream !== false) exists("el espejo", upstream);
  const user = `${uid ?? process.getuid?.() ?? 1000}:${gid ?? process.getgid?.() ?? 1000}`;
  const taskRoot = spec.taskRoot ?? "/work/.task";
  const args = [
    "run",
    "--rm",
    "--init",
    "--shm-size=1g",
    "-v",
    spec.repo === "ro" ? `${repo}:/work:ro` : `${repo}:/work`,
    "-w",
    "/work",
    "-v",
    `${task}:${taskRoot}:ro`,
  ];
  if (spec.upstream !== false) {
    args.push("-v", `${upstream}:/upstream:ro`);
  }
  if (agentsFile) {
    // AGENTS.md de main montado encima del del clon: el implementer no puede
    // cambiar las reglas que lee el revisor.
    args.push("-v", `${agentsFile}:/work/AGENTS.md:ro`);
  }
  for (const name of spec.rw) {
    args.push("-v", `${path.join(task, name)}:${taskRoot}/${name}`);
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
    // El home de la imagen ya trae las dependencias de Hermes; se monta encima
    // solo lo de la fase. Copiar el home entero por fase exigiría red.
    const hermes = path.join(path.dirname(task), "hermes", phase);
    args.push(
      "-v",
      `${path.join(hermes, "config.yaml")}:/opt/hermes/home/config.yaml:ro`,
      "-v",
      `${path.join(hermes, "SOUL.md")}:/opt/hermes/home/SOUL.md:ro`,
      "-v",
      `${path.join(hermes, "skills")}:/skills:ro`,
      "-v",
      `${path.join(hermes, "skills-local")}:/opt/hermes/home/skills`,
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
  agentsFile,
  dryRun,
  out = () => {},
}) {
  ensureArtifactsAt(task);
  const args = dockerArgs({ phase, image, repo, task, upstream, agentsFile });
  // Sin -i, `docker run` no conecta stdin y `--query-file -` llega vacío.
  // Las opciones van antes de la imagen: después, docker las trata como comando.
  const argv = [...args];
  if (input !== undefined) argv.splice(argv.length - 1, 0, "-i");
  argv.push("bash", "-lc", command);
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
