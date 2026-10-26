import fs from "node:fs";
import path from "node:path";

import { runAgent, verdictOf } from "./agents.mjs";
import { git } from "./checkout.mjs";
import { checkTask } from "./checks.mjs";
import { linearKey } from "./config.mjs";
import { guardTask } from "./guard.mjs";
import { imageTag } from "./image.mjs";
import { getIssue, setState } from "./linear.mjs";
import { publish } from "./pr.mjs";
import { previewTask } from "./preview.mjs";
import { publishPrReview, ship } from "./ship.mjs";
import { home, load, repoDir } from "./state.mjs";
import { startTask } from "./task.mjs";

export const CHAIN = [
  "start",
  "implement",
  "check",
  "review",
  "pr",
  "preview",
  "ship",
  "pr-review",
];

function stepsFor(key, state) {
  if (!state) return [...CHAIN];
  switch (state.state) {
    case "In Progress":
      return [
        "implement",
        "check",
        "review",
        "pr",
        "preview",
        "ship",
        "pr-review",
      ];
    case "In validation":
      return ["pr-review"];
    case "Blocked":
      throw new Error(`${key} está bloqueada; usa resume antes de run`);
    default:
      throw new Error(`run no continúa desde ${state.state}`);
  }
}

async function moveLinear(key, base, out) {
  const state = load(key, base);
  if (!state?.issueId) return;
  try {
    await setState(
      linearKey(),
      await getIssue(linearKey(), key),
      "In validation",
    );
  } catch (error) {
    out(`Linear: no se pudo mover a In validation (${error.message})`);
  }
}

const defaultSteps = {
  async start({ key, base, main, out }) {
    if (load(key, base)) return {};
    const source = git(["remote", "get-url", "origin"], { cwd: main });
    const state = await startTask(key, {
      apiKey: linearKey(),
      source,
      base,
      out,
    });
    out(`rama: ${state.branch}`);
    return {};
  },
  implement({ key, base, main, out }) {
    runAgent(key, {
      phase: "implementer",
      base,
      main,
      image: imageTag(),
      out,
    });
    return {};
  },
  check({ key, base, main, out }) {
    const guard = guardTask(key, { base, main });
    if (guard.noApprove) {
      return {
        stop: "check",
        hint: `Rutas no aprobables: ${guard.touched.join(", ")}`,
      };
    }
    if (guard.needsApproval && !guard.approval) {
      return {
        stop: "check",
        hint: `Faltan aprobaciones (${guard.touched.join(", ")}): orquestator approve ${key} --motivo "…"`,
      };
    }
    const result = checkTask(key, {
      base,
      image: imageTag(),
      files: guard.files,
      main,
      out,
    });
    if (!result.ok) {
      return {
        stop: "check",
        hint: `Comprobaciones FALLAN; revisa checks.md y ejecuta orquestator fix ${key} --from checks`,
      };
    }
    return {};
  },
  review({ key, base, main, out }) {
    const result = runAgent(key, {
      phase: "reviewer",
      base,
      main,
      image: imageTag(),
      out,
    });
    const verdict = verdictOf(result.artifact);
    if (!verdict) {
      return { stop: "review", hint: "review.md no trae «Veredicto:»" };
    }
    out(`review: ${verdict}`);
    if (verdict === "CAMBIOS") {
      return {
        stop: "review",
        hint: `La revisión pide cambios; ejecuta orquestator fix ${key} --from review`,
      };
    }
    return {};
  },
  pr({ key, base, main, out }) {
    const result = publish(key, { base, main, out });
    out(`PR #${result.number}: ${result.url}`);
    return {};
  },
  async preview({ key, base, main, out }) {
    const result = await previewTask(key, {
      base,
      main,
      image: imageTag(),
      out,
    });
    out(`preview: ${result.web} (${result.api})`);
    return {};
  },
  async ship({ key, base, main, out }) {
    const result = ship(key, { base, main, out });
    if (result.pendingMigration) {
      return {
        stop: "migrate",
        hint: `Migración pendiente: approve ${key} --migracion y migrate ${key}`,
      };
    }
    out(`PR #${result.number} actualizada (${result.sha.slice(0, 7)})`);
    await moveLinear(key, base, out);
    return {};
  },
  async "pr-review"({ key, base, main, out }) {
    const result = runAgent(key, {
      phase: "pr-review",
      base,
      main,
      image: imageTag(),
      out,
    });
    const verdict = verdictOf(result.artifact);
    if (!verdict) {
      return { stop: "pr-review", hint: "pr-review.md no trae «Veredicto:»" };
    }
    const { number } = publishPrReview(key, { base, out });
    out(`pr-review: ${verdict} (comentado en la PR #${number})`);
    if (verdict === "CAMBIOS") {
      return {
        stop: "pr-review",
        hint: `La re-revisión pide cambios; ejecuta orquestator fix ${key} --from pr-review`,
      };
    }
    return {};
  },
};

export async function runFlow(
  key,
  {
    dryRun,
    base = home(),
    main = process.cwd(),
    out = () => {},
    steps = defaultSteps,
  } = {},
) {
  const state = load(key, base);
  const list = stepsFor(key, state);
  if (dryRun) {
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
    for (const step of list) out(`[dry-run] ${step} ${key}`);
    out(
      "[dry-run] paradas: Blocked (pregunta) o In validation (espera tu validación)",
    );
    return { steps: list, dryRun: true };
  }
  for (const name of list) {
    out(`▶ ${name}`);
    let result;
    try {
      result = await steps[name]({ key, base, main, out });
    } catch (error) {
      return { ok: false, stop: name, error: error.message };
    }
    if (result?.stop) {
      if (result.hint) out(result.hint);
      return { ok: false, stop: result.stop, hint: result.hint };
    }
  }
  return { ok: true };
}
