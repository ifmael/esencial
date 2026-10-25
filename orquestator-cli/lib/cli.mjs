import fs from "node:fs";
import { runAgent, verdictOf } from "./agents.mjs";
import { git } from "./checkout.mjs";
import { checkTask } from "./checks.mjs";
import { clean } from "./clean.mjs";
import { linearKey, linearTeam } from "./config.mjs";
import { fixTask } from "./fix.mjs";
import { approveState, guardTask } from "./guard.mjs";
import { imageTag } from "./image.mjs";
import { inspect } from "./inspect.mjs";
import { getIssue, notifyBlocked, setState } from "./linear.mjs";
import { approvePr } from "./manual.mjs";
import { publish } from "./pr.mjs";
import { previewTask } from "./preview.mjs";
import { runFlow } from "./run.mjs";
import { publishPrReview, ship } from "./ship.mjs";
import { createIssue, specReview } from "./spec.mjs";
import {
  assertKey,
  block,
  list,
  load,
  normalize,
  repoDir,
  resume,
  save,
  taskDir,
  withLock,
} from "./state.mjs";
import { mirrorPath, startTask } from "./task.mjs";
import { watch } from "./watch.mjs";

export const USAGE = `orquestator — flujo de tareas de Esencial

Uso:
  orquestator spec --titulo "…" [--cuerpo fichero.md]
  orquestator spec-review ESN-123  preguntas del spec-reviewer en la issue
  orquestator start ESN-123       abre la tarea: clon, rama y brief
  orquestator implement ESN-123   el implementer trabaja en el clon
  orquestator check ESN-123       lint, tipos, tests y e2e en el contenedor
  orquestator review ESN-123      el reviewer revisa el diff (review.md)
  orquestator pr ESN-123          sube la rama y abre la PR con pr-body.md
  orquestator preview ESN-123     despliega los previews de la rama (D1/R2 de preview)
  orquestator pr-review ESN-123   re-revisión de la PR (pr-review.md)
  orquestator ship ESN-123        actualiza el body y comenta checks/review
  orquestator inspect ESN-123     estado, brief, diff, artefactos y CI
  orquestator clean ESN-123 [--force]
  orquestator fix ESN-123 [--from checks|review|pr-review|conflicto] [--humano]
  orquestator run ESN-123 [--dry-run]
  orquestator watch [--max-parallel N] [--interval S] [--once]
  orquestator guard ESN-123       rutas protegidas y hash del diff
  orquestator approve ESN-123 --motivo "…"
  orquestator approve --pr 42 --motivo "…"   PR que no abre el CLI
  orquestator status [ESN-123]    estado de una tarea (o de todas)
  orquestator block ESN-123 <pregunta>
  orquestator resume ESN-123

Opciones:
  --dry-run   enseña lo que haría sin escribir nada
  --force     clean aunque la tarea no esté en Done
`;

function line(stream, text = "") {
  stream.write(`${text}\n`);
}

async function notifyBlock(state, question, out) {
  if (!state.issueId) return;
  try {
    await notifyBlocked(linearKey(), { id: state.issueId }, question);
    out("Linear: issue asignada y mención enviada.");
  } catch (error) {
    out(`Linear: no se pudo avisar (${error.message})`);
  }
}

async function moveLinear(key, name, out) {
  const state = load(key);
  if (!state?.issueId) return;
  try {
    // setState necesita el equipo; el estado local solo guarda el id.
    await setState(linearKey(), await getIssue(linearKey(), key), name);
  } catch (error) {
    out(`Linear: no se pudo mover a ${name} (${error.message})`);
  }
}

function parseKey(raw, stderr) {
  try {
    return assertKey(raw);
  } catch (error) {
    line(stderr, error.message);
    return null;
  }
}

function describe(stream, state) {
  line(stream, state.key);
  line(stream, `  estado: ${state.state}`);
  if (state.branch) line(stream, `  rama: ${state.branch}`);
  if (state.question) line(stream, `  pregunta: ${state.question}`);
  line(stream, `  clon: ${repoDir(state.key)}`);
  line(stream, `  artefactos: ${taskDir(state.key)}`);
}

export async function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const dryRun = argv.includes("--dry-run");
  const args = argv.filter((arg) => arg !== "--dry-run");
  const [command, ...rest] = args;

  try {
    switch (command) {
      case "spec": {
        const at = rest.indexOf("--titulo");
        const title = at === -1 ? "" : (rest[at + 1] ?? "");
        if (!title.trim()) throw new Error('spec necesita --titulo "…"');
        const bodyAt = rest.indexOf("--cuerpo");
        const file = bodyAt === -1 ? "" : (rest[bodyAt + 1] ?? "");
        const body = file ? fs.readFileSync(file, "utf8") : "";
        if (dryRun) {
          line(stdout, `[dry-run] crear "${title}" en Spec review`);
          return 0;
        }
        const issue = await createIssue(linearKey(), { title, body });
        line(stdout, `${issue.identifier}: ${issue.url}`);
        return 0;
      }
      case "spec-review": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        if (dryRun) {
          line(
            stdout,
            `[dry-run] ${key}: spec-reviewer sobre la issue y comentario con sus preguntas`,
          );
          return 0;
        }
        const result = await specReview(key, {
          apiKey: linearKey(),
          main: process.cwd(),
          out: (text) => line(stdout, text),
        });
        line(stdout, `Comentario publicado en ${result.issue.identifier}.`);
        return 0;
      }
      case "start": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        if (dryRun) {
          line(
            stdout,
            `[dry-run] ${key}: leer la issue en Linear (debe estar en Ready)`,
          );
          line(stdout, `[dry-run] espejo ${mirrorPath()} (crear o actualizar)`);
          line(
            stdout,
            `[dry-run] clonar en ${repoDir(key)} y crear la rama ${key}-<slug>`,
          );
          line(
            stdout,
            `[dry-run] escribir ${taskDir(key)}/brief.md y los artefactos`,
          );
          line(
            stdout,
            `[dry-run] Linear: In Progress y comentario con la rama`,
          );
          return 0;
        }
        if (load(key))
          throw new Error(`${key} ya está empezada; usa status o resume`);
        let source;
        try {
          source = git(["remote", "get-url", "origin"], { cwd: process.cwd() });
        } catch {
          throw new Error(
            "Ejecuta el CLI desde el repo (no encuentro el remoto origin)",
          );
        }
        const state = await startTask(key, {
          apiKey: linearKey(),
          source,
          out: (text) => line(stdout, text),
        });
        describe(stdout, state);
        return 0;
      }
      case "implement": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        const result = runAgent(key, {
          phase: "implementer",
          dryRun,
          main: process.cwd(),
          out: (text) => line(stdout, text),
        });
        if (result.dryRun) return 0;
        line(stdout, "impl.md escrito");
        return 0;
      }
      case "review": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        const result = runAgent(key, {
          phase: "reviewer",
          dryRun,
          main: process.cwd(),
          out: (text) => line(stdout, text),
        });
        if (result.dryRun) return 0;
        const verdict = verdictOf(result.artifact);
        if (!verdict) throw new Error("review.md no trae «Veredicto:»");
        line(stdout, `review: ${verdict}`);
        if (verdict === "CAMBIOS") {
          line(stdout, `Ejecuta: orquestator fix ${key} --from review`);
          return 1;
        }
        return 0;
      }
      case "pr-review": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        const result = runAgent(key, {
          phase: "pr-review",
          dryRun,
          main: process.cwd(),
          out: (text) => line(stdout, text),
        });
        if (result.dryRun) {
          publishPrReview(key, {
            dryRun,
            out: (text) => line(stdout, text),
          });
          return 0;
        }
        const verdict = verdictOf(result.artifact);
        if (!verdict) throw new Error("pr-review.md no trae «Veredicto:»");
        const { number } = publishPrReview(key, {
          out: (text) => line(stdout, text),
        });
        line(stdout, `pr-review: ${verdict} (PR #${number})`);
        if (verdict === "CAMBIOS") {
          line(stdout, `Ejecuta: orquestator fix ${key} --from pr-review`);
          return 1;
        }
        return 0;
      }
      case "check": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        let files = [];
        if (!dryRun) {
          const guard = guardTask(key, { main: process.cwd() });
          if (guard.noApprove) {
            throw new Error(`Rutas no aprobables: ${guard.touched.join(", ")}`);
          }
          if (guard.needsApproval && !guard.approval) {
            throw new Error(
              `Faltan aprobaciones (${guard.touched.join(", ")}): orquestator approve ${key} --motivo "…"`,
            );
          }
          files = guard.files;
        }
        let result;
        try {
          result = checkTask(key, {
            dryRun,
            image: imageTag(),
            files,
            main: process.cwd(),
            out: (text) => line(stdout, text),
          });
        } catch (error) {
          if (error.code !== "MIGRATION_LOCKED") throw error;
          let next;
          withLock(key, () => {
            next = block(load(key), error.message);
            save(key, next);
          });
          await notifyBlock(next, error.message, (text) => line(stdout, text));
          line(stdout, `Blocked: ${error.message}`);
          return 1;
        }
        if (dryRun) return 0;
        if (result.ok) {
          line(stdout, "Comprobaciones OK (checks.md)");
          return 0;
        }
        line(
          stdout,
          `Comprobaciones FALLAN (exit ${result.status}); mira checks.md`,
        );
        return 1;
      }
      case "pr": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        if (dryRun) {
          publish(key, { dryRun, out: (text) => line(stdout, text) });
          return 0;
        }
        const result = await publish(key, {
          out: (text) => line(stdout, text),
        });
        line(stdout, `PR #${result.number}: ${result.url}`);
        return 0;
      }
      case "preview": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        const result = await previewTask(key, {
          dryRun,
          out: (text) => line(stdout, text),
        });
        if (result.dryRun) return 0;
        line(stdout, `Preview web: ${result.web}`);
        line(stdout, `Preview API: ${result.api}`);
        return 0;
      }
      case "fix": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        const at = rest.indexOf("--from");
        const origin = rest.includes("--humano")
          ? "humano"
          : at === -1
            ? "checks"
            : rest[at + 1];
        const result = fixTask(key, {
          origin,
          dryRun,
          out: (text) => line(stdout, text),
        });
        if (result.dryRun) return 0;
        if (result.blocked) {
          line(stdout, result.state.question);
          return 1;
        }
        return 0;
      }
      case "inspect": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        line(stdout, inspect(key, { dryRun }));
        return 0;
      }
      case "clean": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        const result = await clean(key, {
          dryRun,
          force: args.includes("--force"),
          out: (text) => line(stdout, text),
        });
        return result ? 0 : 1;
      }
      case "run": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        const result = await runFlow(key, {
          dryRun,
          out: (text) => line(stdout, text),
        });
        if (result.ok || result.dryRun) return 0;
        if (result.hint) line(stdout, result.hint);
        return 1;
      }
      case "watch": {
        const value = (flag, fallback) => {
          const at = rest.indexOf(flag);
          if (at === -1) return fallback;
          const found = rest[at + 1];
          if (!found || found.startsWith("--")) {
            throw new Error(`${flag} necesita un valor`);
          }
          return found;
        };
        const maxParallel = Number(value("--max-parallel", "1"));
        const intervalSecs = Number(value("--interval", "60"));
        const team = value("--team", linearTeam());
        const controller = new AbortController();
        const stop = () => controller.abort();
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
        try {
          const result = await watch({
            dryRun,
            maxParallel,
            intervalSecs,
            team,
            once: rest.includes("--once"),
            signal: controller.signal,
            out: (text) => line(stdout, text),
          });
          line(stdout, result.once ? "watch: una pasada" : "watch: parado");
          return 0;
        } finally {
          process.off("SIGINT", stop);
          process.off("SIGTERM", stop);
        }
      }
      case "ship": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        if (dryRun) {
          ship(key, { dryRun, out: (text) => line(stdout, text) });
          return 0;
        }
        const result = ship(key, { out: (text) => line(stdout, text) });
        line(
          stdout,
          `PR #${result.number} actualizada (${result.sha.slice(0, 7)})`,
        );
        if (result.state === "In validation") {
          await moveLinear(key, "In validation", (text) => line(stdout, text));
        }
        return 0;
      }
      case "guard": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        if (dryRun) {
          line(
            stdout,
            `[dry-run] ${key}: importaría la rama y diffea contra origin/main`,
          );
          return 0;
        }
        const result = guardTask(key, { main: process.cwd() });
        line(stdout, `hash: ${result.hash}`);
        if (result.files.length === 0)
          line(stdout, "Sin cambios frente a origin/main.");
        for (const file of result.touched) line(stdout, `  protegido: ${file}`);
        if (result.noApprove)
          line(stdout, "OJO: hay rutas que no se pueden aprobar.");
        line(
          stdout,
          result.approval
            ? `aprobado: ${result.approval.reason} (${result.approval.at})`
            : "sin aprobar",
        );
        return 0;
      }
      case "approve": {
        const at = rest.indexOf("--motivo");
        const reason = at === -1 ? "" : (rest[at + 1] ?? "");
        const prAt = rest.indexOf("--pr");
        if (prAt !== -1) {
          const number = Number(rest[prAt + 1]);
          if (!Number.isInteger(number) || number <= 0) {
            throw new Error("--pr necesita un número de PR");
          }
          approvePr(number, {
            isTTY: process.stdin.isTTY,
            reason,
            dryRun,
            out: (text) => line(stdout, text),
          });
          return 0;
        }
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        if (dryRun) {
          line(stdout, `[dry-run] aprobaría el diff protegido de ${key}`);
          return 0;
        }
        if (!process.stdin.isTTY) {
          throw new Error("approve solo se puede usar desde una terminal");
        }
        if (!reason.trim())
          throw new Error('approve necesita un motivo: --motivo "…"');
        const result = guardTask(key, { main: process.cwd() });
        if (result.noApprove) {
          throw new Error(`Rutas no aprobables: ${result.touched.join(", ")}`);
        }
        if (!result.needsApproval) {
          line(
            stdout,
            "El diff no toca rutas protegidas; no hace falta aprobar.",
          );
          return 0;
        }
        withLock(key, () => {
          const state = load(key);
          save(
            key,
            approveState(state, { hash: result.hash, reason, isTTY: true }),
          );
        });
        line(stdout, `Aprobado ${result.hash}`);
        return 0;
      }
      case "status": {
        if (!rest[0]) {
          const tasks = list();
          if (tasks.length === 0) {
            line(stdout, "No hay tareas en ~/.orquestator.");
            return 0;
          }
          for (const task of tasks) {
            line(
              stdout,
              `${task.key}  ${task.state}  ${task.branch ?? ""}`.trimEnd(),
            );
          }
          return 0;
        }
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        const state = load(key);
        if (!state) {
          line(stderr, `La tarea ${key} no existe en ~/.orquestator.`);
          return 1;
        }
        describe(stdout, state);
        return 0;
      }
      case "block": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        const question = rest.slice(1).join(" ").trim();
        if (!question) {
          line(stderr, "Uso: orquestator block ESN-123 <pregunta>");
          return 2;
        }
        if (dryRun) {
          line(stdout, `[dry-run] ${key} → Blocked: ${question}`);
          return 0;
        }
        let next;
        withLock(key, () => {
          const state = load(key);
          if (!state) throw new Error(`La tarea ${key} no existe`);
          next = block(state, question);
          save(key, next);
        });
        describe(stdout, next);
        await notifyBlock(next, question, (text) => line(stdout, text));
        return 0;
      }
      case "resume": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        if (dryRun) {
          const state = load(key);
          if (!state) throw new Error(`La tarea ${key} no existe`);
          line(
            stdout,
            `[dry-run] ${key} → ${normalize(state.blockedFrom ?? "In Progress")}`,
          );
          return 0;
        }
        withLock(key, () => {
          const state = load(key);
          if (!state) throw new Error(`La tarea ${key} no existe`);
          const next = resume(state);
          save(key, next);
          describe(stdout, next);
        });
        return 0;
      }
      case undefined:
      case "help":
      case "--help":
        line(stdout, USAGE);
        return 0;
      default:
        line(stderr, `Comando desconocido: ${command}\n`);
        line(stderr, USAGE);
        return 2;
    }
  } catch (error) {
    line(stderr, error.message);
    return 1;
  }
}
