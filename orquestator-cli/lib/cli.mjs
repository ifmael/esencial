import fs from "node:fs";
import { git } from "./checkout.mjs";

import { checkTask } from "./checks.mjs";
import { clean } from "./clean.mjs";
import { linearKey } from "./config.mjs";
import { fixTask } from "./fix.mjs";
import { approveState, guardTask } from "./guard.mjs";
import { imageTag } from "./image.mjs";
import { inspect } from "./inspect.mjs";
import { publish } from "./pr.mjs";
import { runFlow } from "./run.mjs";
import { ship } from "./ship.mjs";
import { createIssue } from "./spec.mjs";
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

export const USAGE = `orquestator — flujo de tareas de Esencial

Uso:
  orquestator spec --titulo "…" [--cuerpo fichero.md]
  orquestator start ESN-123       abre la tarea: clon, rama y brief
  orquestator check ESN-123       lint, tipos, tests y e2e en el contenedor
  orquestator pr ESN-123          sube la rama y abre la PR con pr-body.md
  orquestator ship ESN-123        actualiza el body y comenta checks/review
  orquestator inspect ESN-123     estado, brief, diff, artefactos y CI
  orquestator clean ESN-123 [--force]
  orquestator fix ESN-123 [--from checks|review|pr-review|conflicto] [--humano]
  orquestator run ESN-123 [--dry-run]
  orquestator guard ESN-123       rutas protegidas y hash del diff
  orquestator approve ESN-123 --motivo "…"
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
            out: (text) => line(stdout, text),
          });
        } catch (error) {
          if (error.code !== "MIGRATION_LOCKED") throw error;
          withLock(key, () => save(key, block(load(key), error.message)));
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
        line(stdout, inspect(key));
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
        const result = runFlow(key, {
          dryRun,
          out: (text) => line(stdout, text),
        });
        return result ? 0 : 1;
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
        return 0;
      }
      case "guard": {
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
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
        const key = parseKey(rest[0], stderr);
        if (!key) return 2;
        const at = rest.indexOf("--motivo");
        const reason = at === -1 ? "" : (rest[at + 1] ?? "");
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
        if (dryRun) {
          line(stdout, `[dry-run] aprobaría ${result.hash}: ${reason}`);
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
        withLock(key, () => {
          const state = load(key);
          if (!state) throw new Error(`La tarea ${key} no existe`);
          const next = block(state, question);
          save(key, next);
          describe(stdout, next);
        });
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
