import { git } from "./checkout.mjs";
import { linearKey } from "./config.mjs";
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
