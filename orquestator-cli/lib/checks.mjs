import fs from "node:fs";
import path from "node:path";

import { ensureArtifactsAt } from "./artifacts.mjs";
import { runPhase } from "./container.mjs";
import { imageTag } from "./image.mjs";
import { migrationsOf, reserveMigration } from "./migrations.mjs";
import { home, load, repoDir, taskDir } from "./state.mjs";
import { mirrorPath } from "./task.mjs";

export const CHECK_COMMAND =
  "pnpm install --offline --frozen-lockfile --store-dir /opt/pnpm-store && pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm e2e";

const TAIL = 120;

function tail(text, lines = TAIL) {
  const all = text.trimEnd().split("\n");
  return all.slice(-lines).join("\n");
}

function report(key, result) {
  const status = result.status;
  const verdict = status === 0 ? "PASS" : `FAIL (exit ${status})`;
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  return [
    `# Checks — ${key}`,
    "",
    `Fecha: ${new Date().toISOString()}`,
    `Resultado: ${verdict}`,
    "",
    "```",
    `$ ${CHECK_COMMAND}`,
    tail(output),
    "```",
    "",
  ].join("\n");
}

export function checkTask(
  key,
  {
    base = home(),
    image = imageTag(),
    runner = runPhase,
    dryRun,
    out,
    files = [],
  } = {},
) {
  const state = load(key, base);
  if (!state) throw new Error(`La tarea ${key} no existe`);
  if (!["In Progress", "In validation"].includes(state.state)) {
    throw new Error(`No se comprueba una tarea en ${state.state}`);
  }
  const migrations = migrationsOf(files);
  if (migrations.length && !dryRun) {
    try {
      reserveMigration({ base, key, files: migrations });
    } catch (error) {
      const locked = new Error(`${error.message}; la tarea queda bloqueada`);
      locked.code = "MIGRATION_LOCKED";
      throw locked;
    }
  }
  const task = taskDir(key, base);
  ensureArtifactsAt(task);
  const result = runner({
    phase: "check",
    image,
    repo: repoDir(key, base),
    task,
    upstream: mirrorPath(base),
    command: CHECK_COMMAND,
    dryRun,
    out,
  });
  if (dryRun || result === null) return { ok: null, status: null };
  fs.writeFileSync(path.join(task, "checks.md"), report(key, result));
  return { ok: result.status === 0, status: result.status };
}
