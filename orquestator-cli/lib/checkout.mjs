import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function git(args, { cwd, ...rest } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...rest,
    }).trim();
  } catch (error) {
    const detail = String(error.stderr ?? "").trim();
    throw new Error(
      `git ${args.join(" ")} falló${detail ? `: ${detail}` : ""}`,
    );
  }
}

const isMirror = (mirror) => fs.existsSync(path.join(mirror, "HEAD"));

/** Espejo bare del repo; se crea la primera vez y se actualiza después. */
export function ensureMirror({ mirror, source }) {
  if (!isMirror(mirror)) {
    fs.mkdirSync(path.dirname(mirror), { recursive: true });
    git(["clone", "--bare", "--no-hardlinks", source, mirror]);
    // Un bare normal no trae refspec: sin esto, fetch solo mueve FETCH_HEAD.
    git(["config", "remote.origin.fetch", "+refs/heads/*:refs/heads/*"], {
      cwd: mirror,
    });
    return;
  }
  git(["fetch", "--prune", "origin"], { cwd: mirror });
}

export function cloneTask({ mirror, repo, branch }) {
  if (!isMirror(mirror))
    throw new Error(`Falta el espejo ${mirror} (ejecuta start de nuevo)`);
  if (fs.existsSync(repo)) throw new Error(`El clon ya existe: ${repo}`);
  fs.mkdirSync(path.dirname(repo), { recursive: true });
  git(["clone", "--local", "--no-hardlinks", "--quiet", mirror, repo]);
  // Sin remoto: el push y los PRs los hace el host desde el checkout principal.
  git(["remote", "remove", "origin"], { cwd: repo });
  git(["switch", "-c", branch], { cwd: repo });
  return repo;
}

export function headOf(repo) {
  return git(["rev-parse", "HEAD"], { cwd: repo });
}
