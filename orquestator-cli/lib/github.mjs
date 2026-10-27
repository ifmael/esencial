import { execFileSync, spawnSync } from "node:child_process";

import { readEnv } from "./config.mjs";

export const GUARD_CONTEXT = "gh-guard";

/** gh usa GH_TOKEN si está; el token vive fuera de los logs. */
export function githubToken(env = process.env) {
  return env.GH_TOKEN || readEnv().GH_TOKEN || null;
}

export function ghEnv(env = process.env) {
  const token = githubToken(env);
  return token ? { ...env, GH_TOKEN: token } : env;
}

/** URL HTTPS para un remoto GitHub; null si no es GitHub. */
export function githubUrl(remote) {
  const ssh = /^git@github\.com:(.+)$/.exec(remote);
  if (ssh) return `https://github.com/${ssh[1]}`;
  if (/^https:\/\/github\.com\//.test(remote)) return remote;
  return null;
}

/** Config de git para autenticar el push/fetch por HTTPS sin sesión. */
export function gitAuthEnv(token) {
  return {
    ...process.env,
    GH_TOKEN: token,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0:
      "!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f",
  };
}

export function runGh(args) {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      env: ghEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = String(error.stderr ?? "").trim();
    throw new Error(`gh ${args.join(" ")} falló${detail ? `: ${detail}` : ""}`);
  }
}

export function statusArgs(sha, state, description) {
  return [
    "api",
    `repos/{owner}/{repo}/statuses/${sha}`,
    "-f",
    `state=${state}`,
    "-f",
    "context=gh-guard",
    "-f",
    `description=${description}`,
    "-f",
    "target_url=",
  ];
}

export function createArgs(title, bodyFile, branch) {
  return [
    "pr",
    "create",
    "--title",
    title,
    "--body-file",
    bodyFile,
    "--base",
    "main",
    "--head",
    branch,
  ];
}

export function editArgs(branch, bodyFile) {
  return ["pr", "edit", branch, "--body-file", bodyFile];
}

export function viewArgs(branch) {
  return [
    "pr",
    "view",
    branch,
    "--json",
    "number,url,headRefOid,state,mergeable,statusCheckRollup",
  ];
}

export function commentArgs(pr, bodyFile) {
  return ["pr", "comment", String(pr), "--body-file", bodyFile];
}

export function commentBodyArgs(pr, body) {
  return ["pr", "comment", String(pr), "--body", body];
}

export function reviewArgs(pr, bodyFile) {
  return ["pr", "review", String(pr), "--comment", "--body-file", bodyFile];
}

export function checksArgs(pr) {
  return ["pr", "checks", String(pr), "--watch", "--interval", "10"];
}

/** Espera a que la CI de la PR termine. Devuelve {status, stdout, stderr}. */
export function runChecks(pr, { allowFailure = [], spawn = spawnSync } = {}) {
  let result;
  // Justo tras abrir la PR, `gh` puede decir que aún no hay checks; se reintenta.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    result = spawn("gh", checksArgs(pr), {
      encoding: "utf8",
      env: ghEnv(),
      timeout: 30 * 60 * 1000,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (!/no checks reported/i.test(output)) break;
    execFileSync("sleep", ["10"]);
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0 && allowFailure.length) {
    const rows = output
      .split("\n")
      .map((line) => line.split("\t"))
      .filter(([name, state]) => name && state);
    const failed = rows
      .filter(([, state]) =>
        ["fail", "failure", "cancelled", "timed_out"].includes(state),
      )
      .map(([name]) => name);
    const pending = rows.some(([, state]) => state === "pending");
    if (
      failed.length &&
      !pending &&
      failed.every((name) => allowFailure.includes(name))
    ) {
      return {
        status: 0,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        ignored: failed,
      };
    }
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
