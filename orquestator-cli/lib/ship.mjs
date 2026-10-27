import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { artifactPath, listArtifacts, readArtifact } from "./artifacts.mjs";
import { checksSummary, markComment } from "./comments.mjs";
import {
  commentArgs,
  editArgs,
  reviewArgs,
  runChecks,
  runGh,
  statusArgs,
  viewArgs,
} from "./github.mjs";
import { guardTask } from "./guard.mjs";
import { migrationsOf } from "./migrations.mjs";
import { home, load, save, transition } from "./state.mjs";

function commentFile(name, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-comment-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return {
    file,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

export function ship(
  key,
  {
    base = home(),
    main = process.cwd(),
    dryRun,
    out = () => {},
    ghRun = runGh,
    checksRun = runChecks,
    waitChecks = true,
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
    const comment = commentFile(
      "checks.md",
      markComment(checksSummary(readArtifact(key, "checks.md", base))),
    );
    try {
      ghRun(commentArgs(pr.number, comment.file));
    } finally {
      comment.cleanup();
    }
  }
  // review.md va como review (gh pr review --comment), no como comentario suelto.
  if (filled.get("review.md")) {
    const comment = commentFile(
      "review.md",
      markComment(readArtifact(key, "review.md", base)),
    );
    try {
      ghRun(reviewArgs(pr.number, comment.file));
    } finally {
      comment.cleanup();
    }
  }

  // El status va antes de esperar a la CI: el job `guard` lo lee y, si no,
  // esperaría a un status que solo se publica al final (deadlock).
  const description = guard.needsApproval ? "aprobado" : "sin rutas protegidas";
  ghRun(statusArgs(pr.headRefOid, "success", description));

  if (waitChecks) {
    const migration = migrationsOf(guard.files);
    const ci = checksRun(pr.number, { allowFailure: ["migracion"] });
    if (ci.status !== 0) {
      const detail = String(ci.stderr ?? "").trim();
      throw new Error(
        `La CI de la PR #${pr.number} no está verde (exit ${ci.status})${detail ? `: ${detail}` : ""}; ejecuta orquestator fix ${key} --from checks`,
      );
    }
    if (migration.length && ci.ignored?.includes("migracion")) {
      out(
        `Migración pendiente: orquestator approve ${key} --migracion --motivo "…" y después migrate ${key}`,
      );
      save(key, { ...state, pr: { ...state.pr, sha: pr.headRefOid } }, base);
      return {
        sha: pr.headRefOid,
        number: pr.number,
        url: pr.url,
        state: state.state,
        pendingMigration: true,
        files: migration,
      };
    }
  }
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
  if (!readArtifact(key, "pr-review.md", base).trim()) {
    throw new Error("pr-review.md está vacío");
  }
  if (dryRun) {
    out(`[dry-run] comentar pr-review.md en la PR #${state.pr.number}`);
    return { dryRun: true };
  }
  const comment = commentFile(
    "pr-review.md",
    markComment(readArtifact(key, "pr-review.md", base)),
  );
  try {
    ghRun(commentArgs(state.pr.number, comment.file));
  } finally {
    comment.cleanup();
  }
  return { number: state.pr.number };
}
