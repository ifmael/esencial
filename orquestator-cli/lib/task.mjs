import path from "node:path";

import { ensureArtifacts, writeArtifact } from "./artifacts.mjs";
import { cloneTask, ensureMirror } from "./checkout.mjs";
import { comment, getIssue, setState } from "./linear.mjs";
import { createState, home, repoDir, save, transition } from "./state.mjs";

export function slugify(title) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function mirrorPath(base = home()) {
  return path.join(base, "upstream.git");
}

export async function startTask(key, options = {}) {
  const { apiKey, fetchImpl, source, base = home(), out = () => {} } = options;
  const issue = await getIssue(apiKey, key, fetchImpl);
  if (issue.state.name !== "Ready") {
    throw new Error(
      `La issue ${key} está en ${issue.state.name}; solo se empieza desde Ready`,
    );
  }
  const branch = `${key}-${slugify(issue.title)}`;
  out(`issue: ${issue.identifier} ${issue.title}`);
  out(`rama: ${branch}`);

  const mirror = mirrorPath(base);
  const repo = repoDir(key, base);
  ensureMirror({ mirror, source });
  cloneTask({ mirror, repo, branch });

  ensureArtifacts(key, base);
  const brief = `# ${issue.identifier} — ${issue.title}\n\n${issue.description ?? ""}\n`;
  writeArtifact(key, "brief.md", brief.replace(/\n{3,}/g, "\n\n"), base);

  await setState(apiKey, issue, "In Progress", fetchImpl);
  await comment(apiKey, issue, `Rama: \`${branch}\``, fetchImpl);

  const state = transition(
    { ...createState(key), branch, issueId: issue.id, issueTitle: issue.title },
    "In Progress",
  );
  save(key, state, base);
  return state;
}
