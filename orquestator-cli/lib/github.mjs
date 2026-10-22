import { execFileSync } from "node:child_process";

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
    "context=guard",
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
  return ["pr", "view", branch, "--json", "number,url,headRefOid,state"];
}

export function commentArgs(pr, bodyFile) {
  return ["pr", "comment", String(pr), "--body-file", bodyFile];
}
