import { execFileSync, spawnSync } from "node:child_process";

export const GUARD_CONTEXT = "gh-guard";

export function runGh(args) {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
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
