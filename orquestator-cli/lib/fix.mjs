import { writeArtifact } from "./artifacts.mjs";
import { runGh, viewArgs } from "./github.mjs";
import { block, home, load, save, transition } from "./state.mjs";

export const LIMITS = {
  checks: 2,
  review: 3,
  "pr-review": 2,
  conflicto: 2,
  humano: Infinity,
};
const COUNTER = {
  checks: "checks",
  review: "review",
  "pr-review": "prReview",
  conflicto: "checks",
  humano: "human",
};

function humanFeedback(state, ghRun) {
  if (!state.pr?.number)
    throw new Error("fix --humano necesita una PR abierta");
  const owner = JSON.parse(ghRun(["api", "user"])).login;
  const pr = JSON.parse(ghRun(viewArgs(String(state.pr.number))));
  return (pr.comments ?? [])
    .filter((comment) => comment.author?.login === owner)
    .map((comment) => comment.body)
    .join("\n\n");
}

export function fixTask(
  key,
  {
    origin = "checks",
    base = home(),
    dryRun,
    out = () => {},
    ghRun = runGh,
  } = {},
) {
  const limit = LIMITS[origin];
  if (limit === undefined) {
    throw new Error(
      `Origen desconocido: ${origin} (${Object.keys(LIMITS).join(", ")})`,
    );
  }
  const state = load(key, base);
  if (!state) throw new Error(`La tarea ${key} no existe`);
  if (!["In Progress", "In validation"].includes(state.state)) {
    throw new Error(`fix no aplica a una tarea en ${state.state}`);
  }

  if (dryRun) {
    out(`[dry-run] ${key}: ronda de ${origin} y vuelta a In Progress`);
    return { dryRun: true };
  }

  const feedback = origin === "humano" ? humanFeedback(state, ghRun) : null;
  const rounds = { human: 0, ...state.rounds };
  const counter = COUNTER[origin];
  const count = (rounds[counter] ?? 0) + 1;

  if (count > limit) {
    const next = block(
      state,
      `Rondas de ${origin} agotadas (${limit}); ¿cómo sigo?`,
    );
    save(key, next, base);
    return { blocked: true, state: next };
  }
  if (feedback !== null)
    writeArtifact(key, "human-feedback.md", feedback, base);

  const counted = { ...state, rounds: { ...rounds, [counter]: count } };
  const next =
    state.state === "In validation"
      ? transition(counted, "In Progress")
      : counted;
  save(key, next, base);
  out(`${key}: ronda ${origin} ${count}/${limit === Infinity ? "∞" : limit}`);
  return { blocked: false, state: next };
}
