import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureArtifactsAt, readArtifact } from "./artifacts.mjs";
import { runPhase } from "./container.mjs";
import { diffPatch, importBranch } from "./guard.mjs";
import { imageTag } from "./image.mjs";
import { home, load, repoDir, taskDir } from "./state.mjs";
import { mirrorPath } from "./task.mjs";

const DIR = fileURLToPath(new URL("../perfiles", import.meta.url));
const MAX_DIFF = 120_000;

/** Perfil de cada fase: modelo, fichero de instrucciones y artefacto de salida. */
export const PROFILES = {
  implementer: {
    file: "implementer.md",
    model: "qwen3.6",
    env: "ORQUESTATOR_MODEL_IMPLEMENTER",
    writes: "impl.md",
  },
  reviewer: {
    file: "reviewer.md",
    model: "deepseek-v4-flash",
    env: "ORQUESTATOR_MODEL_REVIEWER",
    writes: "review.md",
  },
  "pr-review": {
    file: "pr-reviewer.md",
    model: "glm5.3-flash",
    env: "ORQUESTATOR_MODEL_PR_REVIEW",
    writes: "pr-review.md",
  },
};

const CONTEXT = {
  implementer: ["brief", "human-feedback", "checks", "review", "pr-review"],
  reviewer: ["brief", "impl", "checks"],
  "pr-review": ["brief", "impl", "checks", "review", "pr-body"],
};

const MODELS = /^[A-Za-z0-9._-]+$/;

export function modelFor(phase) {
  const spec = PROFILES[phase];
  if (!spec) throw new Error(`Perfil desconocido: ${phase}`);
  const model = process.env[spec.env] || spec.model;
  if (!MODELS.test(model)) throw new Error(`Modelo inválido: ${model}`);
  return model;
}

export function profileText(phase) {
  const spec = PROFILES[phase];
  if (!spec) throw new Error(`Perfil desconocido: ${phase}`);
  return fs.readFileSync(path.join(DIR, spec.file), "utf8").trim();
}

/** Comando de Hermes dentro del contenedor; el prompt entra por stdin. */
export function hermesCommand(model, writes) {
  return [
    "hermes chat --oneshot -Q --safe-mode --yolo",
    "--provider custom --base-url http://esencial-proxy:8080/v1 --api-key dummy",
    `--model ${model}`,
    "--query-file -",
    `> /work/.task/${writes}`,
  ].join(" ");
}

function section(title, text) {
  const body = String(text ?? "").trim();
  return body ? [`## ${title}`, "", body, ""] : [];
}

export function promptFor(phase, context) {
  const parts = [profileText(phase), ""];
  for (const name of CONTEXT[phase]) {
    parts.push(...section(name, context[name]), "");
  }
  if (context.diff !== undefined) {
    const diff = String(context.diff).trim();
    const capped =
      diff.length > MAX_DIFF
        ? `${diff.slice(0, MAX_DIFF)}\n\n[diff recortado: ${diff.length - MAX_DIFF} caracteres]`
        : diff;
    parts.push(
      ...section("diff frente a main", capped || "(sin cambios frente a main)"),
      "",
    );
  }
  return `${parts.join("\n").trimEnd()}\n`;
}

export function verdictOf(text) {
  return (
    /^\W*Veredicto:\s*(APROBADO|CAMBIOS)\b/im.exec(text ?? "")?.[1] ?? null
  );
}

function diffFor(key, { base, main }) {
  const state = load(key, base);
  if (!state?.branch) return "";
  const ref = importBranch({
    main,
    mirror: mirrorPath(base),
    repo: repoDir(key, base),
    branch: state.branch,
    key,
  });
  return diffPatch({ main, ref });
}

function tail(text, size = 400) {
  return String(text ?? "")
    .trim()
    .slice(-size);
}

export function runAgent(
  key,
  {
    phase,
    base = home(),
    main = process.cwd(),
    image = imageTag(),
    dryRun,
    out = () => {},
    runner = runPhase,
    diff,
  } = {},
) {
  const spec = PROFILES[phase];
  if (!spec) {
    throw new Error(
      `Fase desconocida: ${phase} (${Object.keys(PROFILES).join(", ")})`,
    );
  }
  const state = load(key, base);
  if (!state) throw new Error(`La tarea ${key} no existe`);
  const allowed = phase === "pr-review" ? ["In validation"] : ["In Progress"];
  if (!allowed.includes(state.state)) {
    throw new Error(`${phase} no corre con la tarea en ${state.state}`);
  }
  const task = taskDir(key, base);
  ensureArtifactsAt(task);
  const context = { diff };
  for (const name of CONTEXT[phase]) {
    context[name] = readArtifact(key, `${name}.md`, base);
  }
  if (phase !== "implementer" && context.diff === undefined) {
    context.diff = dryRun ? "(dry-run)" : diffFor(key, { base, main });
  }
  const prompt = promptFor(phase, context);
  const command = hermesCommand(modelFor(phase), spec.writes);
  if (!dryRun) {
    fs.mkdirSync(path.join(path.dirname(task), "hermes", phase), {
      recursive: true,
    });
  }
  const result = runner({
    phase,
    image,
    repo: repoDir(key, base),
    task,
    upstream: mirrorPath(base),
    command,
    input: prompt,
    dryRun,
    out,
  });
  if (dryRun) return { dryRun: true, prompt };
  if (result.status !== 0) {
    const detail = tail(result.stderr);
    throw new Error(
      `${phase}: Hermes falló (exit ${result.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  const artifact = readArtifact(key, spec.writes, base);
  if (!artifact.trim()) {
    throw new Error(`${phase}: ${spec.writes} quedó vacío`);
  }
  return { status: result.status, artifact };
}
