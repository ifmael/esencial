import { artifactPath, listArtifacts, readArtifact } from "./artifacts.mjs";
import {
  commentArgs,
  editArgs,
  reviewArgs,
  runGh,
  statusArgs,
  viewArgs,
} from "./github.mjs";
import { guardTask } from "./guard.mjs";
import { home, load, save, transition } from "./state.mjs";

export function ship(
  key,
  {
    base = home(),
    main = process.cwd(),
    dryRun,
    out = () => {},
    ghRun = runGh,
  } = {},
) {
  const state = load(key, base);
  if (!state) throw new Error(`La tarea ${key} no existe`);
  if (!state.pr?.number)
    throw new Error(`La tarea ${key} no tiene PR; ejecuta pr primero`);
  const bodyFile = artifactPath(key, "pr-body.md", base);
  if (!readArtifact(key, "pr-body.md", base).trim())
    throw new Error("pr-body.md está vacío");

  if (dryRun) {
    out(
      `[dry-run] editar el cuerpo de la PR #${state.pr.number} y publicar checks/review`,
    );
    return { dryRun: true };
  }

  const guard = guardTask(key, { base, main });
  if (guard.noApprove)
    throw new Error(`Rutas no aprobables: ${guard.touched.join(", ")}`);
  if (guard.needsApproval && !guard.approval) {
    throw new Error(
      `Faltan aprobaciones (${guard.touched.join(", ")}): orquestator approve ${key} --motivo "…"`,
    );
  }

  const pr = JSON.parse(ghRun(viewArgs(String(state.pr.number))));
  ghRun(editArgs(String(state.pr.number), bodyFile));

  const filled = new Map(
    listArtifacts(key, base).map((a) => [a.name, a.filled]),
  );
  if (filled.get("checks.md")) {
    ghRun(commentArgs(pr.number, artifactPath(key, "checks.md", base)));
  }
  // review.md va como review (gh pr review --comment), no como comentario suelto.
  if (filled.get("review.md")) {
    ghRun(reviewArgs(pr.number, artifactPath(key, "review.md", base)));
  }

  const description = guard.needsApproval ? "aprobado" : "sin rutas protegidas";
  ghRun(statusArgs(pr.headRefOid, "success", description));
  const next =
    state.state === "In Progress" ? transition(state, "In validation") : state;
  save(key, { ...next, pr: { ...state.pr, sha: pr.headRefOid } }, base);
  return {
    sha: pr.headRefOid,
    number: pr.number,
    url: pr.url,
    state: next.state,
  };
}

/** Publica pr-review.md como comentario de la PR (la re-revisión). */
export function publishPrReview(
  key,
  { base = home(), dryRun, out = () => {}, ghRun = runGh } = {},
) {
  const state = load(key, base);
  if (!state) throw new Error(`La tarea ${key} no existe`);
  if (!state.pr?.number) {
    throw new Error(`La tarea ${key} no tiene PR; ejecuta pr antes`);
  }
  const file = artifactPath(key, "pr-review.md", base);
  if (!readArtifact(key, "pr-review.md", base).trim()) {
    throw new Error("pr-review.md está vacío");
  }
  if (dryRun) {
    out(`[dry-run] comentar pr-review.md en la PR #${state.pr.number}`);
    return { dryRun: true };
  }
  ghRun(commentArgs(state.pr.number, file));
  return { number: state.pr.number };
}
