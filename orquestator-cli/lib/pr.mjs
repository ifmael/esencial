import fs from "node:fs";
import path from "node:path";

import { git } from "./checkout.mjs";
import {
  createArgs,
  editArgs,
  runGh,
  statusArgs,
  viewArgs,
} from "./github.mjs";
import { guardTask } from "./guard.mjs";
import { home, load, save, taskDir } from "./state.mjs";

export function pushBranch({ main, key, branch }) {
  git(
    [
      "push",
      "--no-verify",
      "--quiet",
      "origin",
      `refs/orquestator/${key}:refs/heads/${branch}`,
    ],
    { cwd: main },
  );
  return git(["rev-parse", `refs/orquestator/${key}`], { cwd: main });
}

function existingPr(branch, ghRun) {
  try {
    return JSON.parse(ghRun(viewArgs(branch)));
  } catch {
    // Sin PR todavía (o fallo de red): se intenta crear y, si ya existe, gh lo dice.
    return null;
  }
}

export function publish(
  key,
  {
    base = home(),
    main = process.cwd(),
    dryRun,
    out = () => {},
    ghRun = runGh,
  } = {},
) {
  const state = load(key, base);
  if (!state) throw new Error(`La tarea ${key} no existe`);
  if (!state.branch) throw new Error(`La tarea ${key} no tiene rama`);
  const bodyFile = path.join(taskDir(key, base), "pr-body.md");
  if (!fs.existsSync(bodyFile)) throw new Error(`Falta ${bodyFile}`);
  if (!fs.readFileSync(bodyFile, "utf8").trim())
    throw new Error("pr-body.md está vacío");

  const title = `${key} ${state.issueTitle ?? ""}`.trim();
  if (dryRun) {
    out(
      `[dry-run] guard, push de ${state.branch}, PR "${title}" y status gh-guard`,
    );
    return { dryRun: true };
  }

  const guard = guardTask(key, { base, main });
  if (guard.noApprove) {
    throw new Error(`Rutas no aprobables: ${guard.touched.join(", ")}`);
  }
  if (guard.needsApproval && !guard.approval) {
    throw new Error(
      `Faltan aprobaciones (${guard.touched.join(", ")}): orquestator approve ${key} --motivo "…"`,
    );
  }

  const sha = pushBranch({ main, key, branch: state.branch });
  const found = existingPr(state.branch, ghRun);
  const url = found?.number
    ? ghRun(editArgs(state.branch, bodyFile)) || found.url
    : ghRun(createArgs(title, bodyFile, state.branch));
  const description = guard.needsApproval ? "aprobado" : "sin rutas protegidas";
  ghRun(statusArgs(sha, "success", description));

  const number =
    found?.number ?? Number(/\/pull\/(\d+)/.exec(url ?? "")?.[1] ?? 0);
  save(key, { ...state, pr: { number, url } }, base);
  return { url, number, sha };
}
