import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Estados del flujo; los nombres son los de Linear. */
export const STATES = [
  "Backlog",
  "Spec review",
  "Ready",
  "In Progress",
  "In validation",
  "Blocked",
  "Done",
];

const ALIASES = {
  backlog: "Backlog",
  "spec-review": "Spec review",
  "spec review": "Spec review",
  spec_review: "Spec review",
  ready: "Ready",
  "in-progress": "In Progress",
  "in progress": "In Progress",
  in_progress: "In Progress",
  progress: "In Progress",
  "in-validation": "In validation",
  "in validation": "In validation",
  in_validation: "In validation",
  validation: "In validation",
  blocked: "Blocked",
  done: "Done",
};

/** Transiciones que mueve el CLI. Blocked va por block()/resume(). */
export const TRANSITIONS = {
  Backlog: ["Spec review", "Ready"],
  "Spec review": ["Ready"],
  Ready: ["In Progress"],
  "In Progress": ["In validation"],
  "In validation": ["In Progress", "Done"],
  Blocked: [],
  Done: [],
};

const KEY = /^[A-Z][A-Z0-9]{1,5}-\d+$/;
const LOCK_STALE_MS = 5 * 60 * 1000;
const LOCK_WAIT_MS = 2000;

export function assertKey(key) {
  if (!KEY.test(key ?? "")) {
    throw new Error(
      `Clave inválida: ${JSON.stringify(key)} (se espera ESN-123)`,
    );
  }
  return key;
}

export function normalize(name) {
  const raw = String(name).trim();
  if (STATES.includes(raw)) return raw;
  const alias = ALIASES[raw.toLowerCase()];
  if (!alias) {
    throw new Error(
      `Estado desconocido: ${JSON.stringify(name)}. Válidos: ${STATES.join(", ")}`,
    );
  }
  return alias;
}

export function home() {
  return (
    process.env.ORQUESTATOR_HOME ?? path.join(os.homedir(), ".orquestator")
  );
}

export function dirFor(key, base = home()) {
  return path.join(base, assertKey(key));
}

export function statePath(key) {
  return path.join(dirFor(key), "state.json");
}

export function taskDir(key, base = home()) {
  return path.join(dirFor(key, base), "task");
}

export function repoDir(key, base = home()) {
  return path.join(dirFor(key, base), "repo");
}

function now() {
  return new Date().toISOString();
}

export function createState(key) {
  assertKey(key);
  const at = now();
  return {
    key,
    state: "Ready",
    createdAt: at,
    updatedAt: at,
    branch: null,
    blockedFrom: null,
    question: null,
    approvals: {},
    rounds: { checks: 0, review: 0, prReview: 0 },
    history: [{ state: "Ready", at }],
  };
}

export function transition(state, to) {
  const target = normalize(to);
  if (state.state === target) {
    throw new Error(`La tarea ya está en ${target}`);
  }
  const allowed = TRANSITIONS[state.state] ?? [];
  if (!allowed.includes(target)) {
    throw new Error(
      `Transición inválida: ${state.state} → ${target} (válidas desde ${state.state}: ${
        allowed.join(", ") || "ninguna"
      })`,
    );
  }
  const at = now();
  return {
    ...state,
    state: target,
    updatedAt: at,
    history: [...state.history, { state: target, at }],
  };
}

export function block(state, question) {
  const text = String(question ?? "").trim();
  if (!text) throw new Error("Blocked necesita una pregunta concreta");
  if (!["In Progress", "In validation"].includes(state.state)) {
    throw new Error(`No se puede bloquear desde ${state.state}`);
  }
  const at = now();
  return {
    ...state,
    state: "Blocked",
    blockedFrom: state.state,
    question: text,
    updatedAt: at,
    history: [...state.history, { state: "Blocked", at }],
  };
}

export function resume(state) {
  if (state.state !== "Blocked") {
    throw new Error(`La tarea no está bloqueada (está en ${state.state})`);
  }
  const target = normalize(state.blockedFrom ?? "In Progress");
  const at = now();
  return {
    ...state,
    state: target,
    blockedFrom: null,
    question: null,
    updatedAt: at,
    history: [...state.history, { state: target, at }],
  };
}

export function load(key, base = home()) {
  assertKey(key);
  const file = path.join(base, key, "state.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`No se pudo leer ${file}: ${error.message}`);
  }
}

export function save(key, state, base = home()) {
  assertKey(key);
  const dir = path.join(base, key);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "state.json");
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Claves con estado en disco, de la más reciente a la más antigua. */
export function list(base = home()) {
  let entries = [];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const keys = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !KEY.test(entry.name)) continue;
    const state = load(entry.name, base);
    if (state) keys.push(state);
  }
  return keys.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Cerrojo del estado: dos procesos del CLI no lo escriben a la vez. */
export function withLock(key, fn) {
  const dir = dirFor(key);
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, "state.lock");
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const fd = fs.openSync(lock, "wx", 0o600);
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const age = Date.now() - fs.statSync(lock).mtimeMs;
      if (age > LOCK_STALE_MS) {
        fs.rmSync(lock, { force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `El estado de ${key} está cerrado por otro proceso (${lock})`,
        );
      }
      sleep(50);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}
