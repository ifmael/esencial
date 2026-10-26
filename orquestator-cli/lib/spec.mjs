import fs from "node:fs";
import path from "node:path";

import {
  effortFor,
  hermesCommand,
  hermesConfig,
  installSkills,
  installSoul,
  modelFor,
  promptFor,
} from "./agents.mjs";
import { ensureArtifactsAt, readArtifact } from "./artifacts.mjs";
import { runPhase } from "./container.mjs";
import { imageTag } from "./image.mjs";
import { comment, getIssue, request } from "./linear.mjs";
import { specInputHash, specReady, writeSpecMarker } from "./spec-state.mjs";
import { home, taskDir } from "./state.mjs";

const TEAM = `query($key:String!) {
  teams(filter:{key:{eq:$key}}, first:1) {
    nodes { id key states{ nodes{ id name } } }
  }
}`;

export async function createIssue(
  apiKey,
  { title, body, team = process.env.LINEAR_TEAM ?? "ESN" },
  fetchImpl = fetch,
) {
  const teamData = await request(apiKey, TEAM, { key: team }, fetchImpl);
  const found = teamData.teams.nodes[0];
  if (!found) throw new Error(`El equipo ${team} no existe en Linear`);
  const state = found.states.nodes.find((s) => s.name === "Spec review");
  if (!state)
    throw new Error(`El equipo ${team} no tiene el estado Spec review`);

  const data = await request(
    apiKey,
    `mutation($teamId:String!, $title:String!, $description:String, $stateId:String!) {
      issueCreate(input:{teamId:$teamId, title:$title, description:$description, stateId:$stateId}) {
        success issue { id identifier url }
      }
    }`,
    { teamId: found.id, title, description: body, stateId: state.id },
    fetchImpl,
  );
  if (!data.issueCreate?.success)
    throw new Error("La issue no se creó en Linear");
  return data.issueCreate.issue;
}

/** Lanza el spec-reviewer sobre una issue en `Spec review` y publica sus preguntas. */
export async function specReview(
  key,
  {
    apiKey,
    base = home(),
    main = process.cwd(),
    image = imageTag(),
    dryRun,
    out = () => {},
    runner = runPhase,
    fetchImpl = fetch,
  } = {},
) {
  const issue = await getIssue(apiKey, key, fetchImpl);
  if (issue.state.name !== "Spec review") {
    throw new Error(
      `La issue ${key} está en ${issue.state.name}; spec-review solo corre en Spec review`,
    );
  }
  const task = taskDir(key, base);
  ensureArtifactsAt(task);
  const prompt = promptFor("spec-review", {
    title: issue.title,
    description: issue.description ?? "",
  });
  const command = hermesCommand(
    modelFor("spec-review"),
    "spec-review.md",
    "/task",
  );
  if (!dryRun) {
    const hermes = path.join(path.dirname(task), "hermes", "spec-review");
    hermesConfig(hermes, {
      model: modelFor("spec-review"),
      effort: effortFor("spec-review"),
    });
    installSkills("spec-review", hermes);
    installSoul("spec-review", hermes);
    fs.mkdirSync(path.join(hermes, "skills-local"), { recursive: true });
  }
  const result = runner({
    phase: "spec-review",
    image,
    repo: main,
    task,
    command,
    input: prompt,
    dryRun,
    out,
  });
  if (dryRun) return { dryRun: true, prompt };
  if (result.status !== 0) {
    const detail = String(result.stderr ?? "")
      .trim()
      .slice(-400);
    throw new Error(
      `spec-review: Hermes falló (exit ${result.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  const artifact = readArtifact(key, "spec-review.md", base);
  if (!artifact.trim()) throw new Error("spec-review.md quedó vacío");
  await comment(apiKey, issue, artifact, fetchImpl);
  writeSpecMarker(base, key, {
    hash: specInputHash(issue),
    status: specReady(artifact) ? "ready" : "questions",
    at: new Date().toISOString(),
  });
  return { artifact, issue };
}
