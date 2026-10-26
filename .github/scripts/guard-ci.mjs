import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { GUARD_CONTEXT } from "../../orquestator-cli/lib/github.mjs";
import {
  analyze,
  PROTECTED_FILE,
  parsePaths,
} from "../../orquestator-cli/lib/guard.mjs";

const API = "https://api.github.com";

export function ciDecision(files, rules) {
  const { touched, needsApproval } = analyze(files, rules);
  const workflows = touched.some((file) =>
    file.startsWith(".github/workflows/"),
  );
  return {
    touched,
    needsApproval,
    workflows,
    requiresGuard: needsApproval && !workflows,
  };
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function isApprovedStatus(statuses) {
  return (statuses ?? []).some(
    (status) => status.context === GUARD_CONTEXT && status.state === "success",
  );
}

async function guardStatus(repository, sha, token) {
  const response = await fetch(
    `${API}/repos/${repository}/commits/${sha}/status`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "orquestator-guard",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub respondió HTTP ${response.status}`);
  }
  const data = await response.json();
  return isApprovedStatus(data.statuses);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function guardCi({
  env = process.env,
  out = (text) => console.log(text),
  waitMs = Number(env.GUARD_WAIT_SECS ?? 90) * 1000,
  status = guardStatus,
  pause = sleep,
} = {}) {
  const base = env.BASE ?? "origin/main";
  const repository = env.GITHUB_REPOSITORY;
  const sha = env.HEAD_SHA;
  const token = env.GITHUB_TOKEN;
  if (!repository || !sha || !token) {
    throw new Error("Faltan GITHUB_REPOSITORY, HEAD_SHA o GITHUB_TOKEN");
  }

  const rules = parsePaths(git(["show", `${base}:${PROTECTED_FILE}`]));
  const files = git(["diff", "--name-only", `${base}...HEAD`])
    .split("\n")
    .filter(Boolean);
  const decision = ciDecision(files, rules);
  if (decision.touched.length === 0) {
    out("Sin rutas protegidas en el diff.");
    return 0;
  }
  out(`Rutas protegidas: ${decision.touched.join(", ")}`);
  if (decision.workflows) {
    out("Hay cambios de CI: se revisan a mano, el guard no aplica.");
    return 0;
  }

  const deadline = Date.now() + waitMs;
  for (;;) {
    if (await status(repository, sha, token)) {
      out("Status gh-guard: success.");
      return 0;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        "Falta el status gh-guard (orquestator approve y ship, o aprobación manual).",
      );
    }
    await pause(5000);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await guardCi();
  } catch (error) {
    console.error(`guard: ${error.message}`);
    process.exitCode = 1;
  }
}
