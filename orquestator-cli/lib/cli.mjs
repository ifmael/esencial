import { git } from "./checkout.mjs";
import { checkTask } from "./checks.mjs";
import { linearKey } from "./config.mjs";
import { approveState, guardTask } from "./guard.mjs";
import { imageTag } from "./image.mjs";
import { publish } from "./pr.mjs";
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
  orquestator start ESN-123       abre la tarea: clon, rama y brief
  orquestator check ESN-123       lint, tipos, tests y e2e en el contenedor
  orquestator pr ESN-123          sube la rama y abre la PR con pr-body.md
  orquestator guard ESN-123       rutas protegidas y hash del diff
  orquestator approve ESN-123 --motivo "…"
  orquestator status [ESN-123]    estado de una tarea (o de todas)
  orquestator block ESN-123 <pregunta>
  orquestator resume ESN-123

Opciones:
  --dry-run   enseña lo que haría sin escribir nada
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
        const result = checkTask(key, {
          dryRun,
          image: imageTag(),
          out: (text) => line(stdout, text),
        });
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
