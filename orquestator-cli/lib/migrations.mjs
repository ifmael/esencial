import fs from "node:fs";
import path from "node:path";

import { home } from "./state.mjs";

export const MIGRATION_DIR = "api/migrations/";

export function migrationsOf(files) {
  return files.filter((file) => file.startsWith(MIGRATION_DIR));
}

export function lockPath(base = home()) {
  return path.join(base, "migrations.lock.json");
}

export function readLock(base = home()) {
  try {
    return JSON.parse(fs.readFileSync(lockPath(base), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function reserveMigration({ base = home(), key, files }) {
  const lock = readLock(base);
  if (lock && lock.key !== key) {
    throw new Error(
      `Migración abierta en ${lock.key}: ${lock.files.join(", ")}`,
    );
  }
  const entry = { key, files, at: new Date().toISOString() };
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(lockPath(base), `${JSON.stringify(entry, null, 2)}\n`, {
    mode: 0o600,
  });
  return { acquired: !lock, ...entry };
}

export function releaseMigration({ base = home(), key }) {
  const lock = readLock(base);
  if (lock?.key === key) fs.rmSync(lockPath(base), { force: true });
}
