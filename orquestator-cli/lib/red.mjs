import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { git } from "./checkout.mjs";

const TEST_FILE = /^(api|web|e2e)\/tests\/.*\.(test|spec)\.(ts|tsx)$/;

export function testFiles(files) {
  return files.filter((file) => TEST_FILE.test(file));
}

/** Señales de que un test se ha debilitado respecto a `main`. */
export function weakSignals(before, after) {
  const signals = [];
  const count = (text, re) => (text.match(re) ?? []).length;
  if (
    count(after, /\b(?:test|it|describe)\.(?:skip|only|todo)\(/g) >
    count(before, /\b(?:test|it|describe)\.(?:skip|only|todo)\(/g)
  ) {
    signals.push("aparecen skip/only/todo nuevos");
  }
  if (count(after, /\b(?:test|it)\(/g) < count(before, /\b(?:test|it)\(/g)) {
    signals.push("hay menos tests que en main");
  }
  if (count(after, /\bexpect\(/g) < count(before, /\bexpect\(/g)) {
    signals.push("hay menos expect que en main");
  }
  if (before && after && after.trim() === before.trim()) {
    signals.push("el fichero no cambia");
  }
  return signals;
}

function packageOf(file) {
  return file.split("/")[0];
}

function commandFor(files) {
  const install =
    "pnpm install --offline --frozen-lockfile --store-dir /opt/pnpm-store";
  const groups = new Map();
  for (const file of files) {
    const pkg = packageOf(file);
    groups.set(pkg, [...(groups.get(pkg) ?? []), file]);
  }
  const runs = [];
  for (const [pkg, list] of groups) {
    if (pkg === "api")
      runs.push(
        `pnpm --filter @esencial/api exec vitest run ${list.join(" ")}`,
      );
    if (pkg === "web")
      runs.push(
        `pnpm --filter @esencial/web exec vitest run ${list.join(" ")}`,
      );
    if (pkg === "e2e")
      runs.push(
        `pnpm --filter @esencial/e2e exec playwright test ${list.join(" ")}`,
      );
  }
  return `${install} && ${runs.join(" && ")}`;
}

/**
 * Copia a un worktree de `main` los tests que toca la rama y los ejecuta: si
 * pasan, no demuestran el cambio (GREEN indebido). Los e2e no se prueban aquí.
 */
export function redProbe({
  main,
  repo,
  files,
  run,
  base = os.tmpdir(),
  out = () => {},
}) {
  const changed = testFiles(files).filter((file) => !file.startsWith("e2e/"));
  const notes = [];
  if (changed.length === 0) return { failedAsExpected: 0, passing: 0, notes };

  const worktree = fs.mkdtempSync(path.join(base, "red-"));
  let failedAsExpected = 0;
  let passing = 0;
  try {
    git(["worktree", "add", "--detach", "--quiet", worktree, "origin/main"], {
      cwd: main,
    });
    for (const file of changed) {
      const after = fs.readFileSync(path.join(repo, file), "utf8");
      fs.mkdirSync(path.dirname(path.join(worktree, file)), {
        recursive: true,
      });
      fs.writeFileSync(path.join(worktree, file), after);
      let before = "";
      try {
        before = git(["show", `origin/main:${file}`], { cwd: main });
      } catch {
        // Fichero nuevo: no hay versión en main.
      }
      for (const signal of weakSignals(before, after))
        notes.push(`${file}: ${signal}`);
    }

    const result = run({
      phase: "check",
      repo: worktree,
      files: changed,
      command: commandFor(changed),
      out,
    });
    if (result && result.status === 0) {
      passing = changed.length;
      notes.push(
        `RED: ${changed.join(", ")} pasa contra main; el test no demuestra el cambio`,
      );
    } else {
      failedAsExpected = changed.length;
      notes.push(`RED: ${changed.join(", ")} falla contra main (correcto)`);
    }
  } catch (error) {
    notes.push(`RED no disponible: ${error.message}`);
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", worktree], {
      cwd: main,
      stdio: "ignore",
    });
    fs.rmSync(worktree, { recursive: true, force: true });
  }
  return { failedAsExpected, passing, notes };
}
