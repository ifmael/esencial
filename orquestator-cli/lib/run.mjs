import fs from "node:fs";
import path from "node:path";

import { git } from "./checkout.mjs";
import { home, load, repoDir } from "./state.mjs";

export const CHAIN = ["start", "check", "review", "ship", "pr-review"];

function stepsFor(key, state) {
  if (!state) return [...CHAIN];
  switch (state.state) {
    case "In Progress":
      return ["check", "review", "ship", "pr-review"];
    case "In validation":
      return ["pr-review"];
    case "Blocked":
      throw new Error(`${key} está bloqueada; usa resume antes de run`);
    default:
      throw new Error(`run no continúa desde ${state.state}`);
  }
}

export function runFlow(key, { dryRun, base = home(), out = () => {} } = {}) {
  const state = load(key, base);
  const steps = stepsFor(key, state);
  if (!dryRun) {
    // shortcut: sin las fases de agente (M3), run no puede recorrerlas en serio.
    throw new Error(
      "run real necesita las fases de agente (M3); usa start, check, pr y ship",
    );
  }
  if (state?.branch) {
    const repo = repoDir(key, base);
    if (!fs.existsSync(path.join(repo, ".git"))) {
      out(`[dry-run] clon: falta ${repo}`);
    } else {
      const branch = git(["branch", "--show-current"], { cwd: repo });
      out(
        `[dry-run] clon: ${branch === state.branch ? "en" : "en otra rama:"} ${branch} (esperada ${state.branch})`,
      );
    }
  }
  for (const step of steps) out(`[dry-run] ${step} ${key}`);
  out(
    "[dry-run] paradas: Blocked (pregunta) o In validation (espera tu validación)",
  );
  return { steps, dryRun: true };
}
