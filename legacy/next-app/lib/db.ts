// SQLite singleton (design D1/D2). The ONLY module besides app/api/** allowed to
// import better-sqlite3. Path from ESSENTIAL_DB_PATH (tests use a temp file),
// default data/esencial.db relative to the app root.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const file = process.env.ESSENTIAL_DB_PATH || path.join(process.cwd(), "data", "esencial.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const handle = new Database(file);
  handle.pragma("journal_mode = WAL");
  handle.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");
  handle.exec(schema);
  db = handle;
  return db;
}

/** Close and forget the connection (test isolation only). */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
