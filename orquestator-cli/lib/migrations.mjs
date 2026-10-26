import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { home } from "./state.mjs";

export const MIGRATION_DIR = "api/migrations/";

export function migrationsOf(files) {
  return files.filter((file) => file.startsWith(MIGRATION_DIR));
}

export function sqlHash(sql) {
  return createHash("sha256").update(String(sql)).digest("hex");
}

/** Hash estable de ficheros + contenido: lo que firma `approve --migracion`. */
export function hashMigrations(entries) {
  const lines = entries
    .map(({ file, sql }) => `${file}\t${sqlHash(sql)}`)
    .sort();
  return sqlHash(lines.join("\n"));
}

function statements(sql) {
  return String(sql)
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(";")
    .map((text) => text.trim())
    .filter(Boolean);
}

/** Heurística: una migración destructiva exige `migrate --force`. */
export function destructiveSql(sql) {
  const found = [];
  for (const statement of statements(sql)) {
    if (/\bDROP\s+(?:TABLE|INDEX|COLUMN|TRIGGER|VIEW)\b/i.test(statement)) {
      found.push(`DROP: ${statement.slice(0, 80)}`);
      continue;
    }
    if (/\bALTER\s+TABLE\b[\s\S]*\bDROP\b/i.test(statement)) {
      found.push(`ALTER … DROP: ${statement.slice(0, 80)}`);
      continue;
    }
    if (
      /\bALTER\s+TABLE\b[\s\S]*\bADD\s+(?:COLUMN\s+)?[\w"`]+\s+[^;]*\bNOT\s+NULL\b/i.test(
        statement,
      ) &&
      !/\bDEFAULT\b/i.test(statement)
    ) {
      found.push(`ADD … NOT NULL sin DEFAULT: ${statement.slice(0, 80)}`);
    }
  }
  return found;
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
