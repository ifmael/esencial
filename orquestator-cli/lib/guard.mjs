import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { git } from "./checkout.mjs";
import { home, load, repoDir } from "./state.mjs";

export const PROTECTED_FILE = "orquestator-cli/protected-paths.txt";
export const BASE = "origin/main";

export function parsePaths(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const noApprove = line.startsWith("!");
      const raw = noApprove ? line.slice(1) : line;
      return { path: raw, prefix: raw.endsWith("/"), noApprove };
    });
}

export function analyze(files, rules) {
  const touched = new Set();
  let noApprove = false;
  for (const file of files) {
    for (const rule of rules) {
      const hit = rule.prefix ? file.startsWith(rule.path) : file === rule.path;
      if (!hit) continue;
      touched.add(file);
      if (rule.noApprove) noApprove = true;
      break;
    }
  }
  const list = [...touched].sort();
  return { touched: list, noApprove, needsApproval: list.length > 0 };
}

// En el checkout principal (config de confianza) y sin diff externo ni texto.
function safeGit(args, cwd) {
  return git(["-c", "diff.external=", "--no-pager", ...args], { cwd });
}

export function importBranch({ main, mirror, repo, branch, key }) {
  // El push sale del clon con los hooks neutralizados; el fetch entra desde el
  // espejo, que es nuestro. El config del clon no se ejecuta nunca.
  git(
    [
      "-c",
      "core.hooksPath=/dev/null",
      "push",
      "--no-verify",
      "--quiet",
      mirror,
      `refs/heads/${branch}:refs/heads/${branch}`,
    ],
    { cwd: repo },
  );
  const ref = `refs/orquestator/${key}`;
  git(
    ["fetch", "--no-tags", "--quiet", mirror, `+refs/heads/${branch}:${ref}`],
    { cwd: main },
  );
  return ref;
}

export function diffFiles({ main, ref, baseRef = BASE }) {
  const out = safeGit(
    [
      "diff",
      "--name-only",
      "--no-ext-diff",
      "--no-textconv",
      `${baseRef}...${ref}`,
    ],
    main,
  );
  return out ? out.split("\n").filter(Boolean) : [];
}

export function diffPatch({ main, ref, baseRef = BASE }) {
  return safeGit(
    [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--binary",
      `${baseRef}...${ref}`,
    ],
    main,
  );
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function protectedRules({ main, baseRef = BASE }) {
  try {
    return parsePaths(
      git(["show", `${baseRef}:${PROTECTED_FILE}`], { cwd: main }),
    );
  } catch {
    const file = path.join(main, PROTECTED_FILE);
    if (!fs.existsSync(file))
      throw new Error(`Falta ${PROTECTED_FILE} en ${baseRef}`);
    return parsePaths(fs.readFileSync(file, "utf8"));
  }
}

export function guardTask(
  key,
  { base = home(), main = process.cwd(), baseRef = BASE } = {},
) {
  const state = load(key, base);
  if (!state) throw new Error(`La tarea ${key} no existe`);
  if (!state.branch) throw new Error(`La tarea ${key} no tiene rama`);
  const repo = repoDir(key, base);
  if (!fs.existsSync(repo)) throw new Error(`Falta el clon: ${repo}`);
  const mirror = path.join(base, "upstream.git");
  const ref = importBranch({ main, mirror, repo, branch: state.branch, key });
  const files = diffFiles({ main, ref, baseRef });
  const verdict = analyze(files, protectedRules({ main, baseRef }));
  const hash = sha256(diffPatch({ main, ref, baseRef }));
  const saved = state.approvals?.guard;
  return {
    ...verdict,
    files,
    hash,
    approval: saved?.hash === hash ? saved : null,
    state,
  };
}

export function approveState(state, { hash, reason, isTTY }) {
  if (!isTTY) throw new Error("approve solo se puede usar desde una terminal");
  const text = String(reason ?? "").trim();
  if (!text) throw new Error("approve necesita un motivo (--motivo)");
  return {
    ...state,
    approvals: {
      ...state.approvals,
      guard: { hash, reason: text, at: new Date().toISOString() },
    },
  };
}
