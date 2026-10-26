import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  destructiveSql,
  hashMigrations,
  migrationsOf,
  readLock,
  releaseMigration,
  reserveMigration,
} from "../lib/migrations.mjs";

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-mig-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test("migrationsOf filtra solo api/migrations", () => {
  assert.deepEqual(
    migrationsOf([
      "api/migrations/0027_x.sql",
      "api/src/index.ts",
      "AGENTS.md",
    ]),
    ["api/migrations/0027_x.sql"],
  );
});

test("reserva, conflicto con otra tarea y liberación", () => {
  const first = reserveMigration({ base: dir, key: "ESN-1", files: ["a.sql"] });
  assert.equal(first.acquired, true);
  assert.equal(readLock(dir).key, "ESN-1");
  assert.throws(
    () => reserveMigration({ base: dir, key: "ESN-2", files: ["b.sql"] }),
    /Migración abierta en ESN-1/,
  );
  releaseMigration({ base: dir, key: "ESN-2" });
  assert.ok(readLock(dir));
  releaseMigration({ base: dir, key: "ESN-1" });
  assert.equal(readLock(dir), null);
});

test("la misma tarea puede repasar su reserva", () => {
  reserveMigration({ base: dir, key: "ESN-1", files: ["a.sql"] });
  const again = reserveMigration({
    base: dir,
    key: "ESN-1",
    files: ["a.sql", "b.sql"],
  });
  assert.equal(again.acquired, false);
  assert.deepEqual(readLock(dir).files, ["a.sql", "b.sql"]);
});

test("hashMigrations ata nombre y contenido, sin depender del orden", () => {
  const a = { file: "api/migrations/0002_b.sql", sql: "CREATE TABLE b (x);" };
  const b = { file: "api/migrations/0001_a.sql", sql: "CREATE TABLE a (x);" };
  const hash = hashMigrations([a, b]);
  assert.equal(hash, hashMigrations([b, a]));
  assert.notEqual(
    hash,
    hashMigrations([{ ...a, sql: "CREATE TABLE c (x);" }, b]),
  );
});

test("destructiveSql avisa de DROP y NOT NULL sin DEFAULT", () => {
  assert.deepEqual(destructiveSql("CREATE TABLE a (id INTEGER);"), []);
  assert.match(destructiveSql("DROP TABLE a;")[0], /DROP/);
  assert.match(destructiveSql("ALTER TABLE a DROP COLUMN b;")[0], /DROP/);
  assert.match(
    destructiveSql("ALTER TABLE a ADD COLUMN b TEXT NOT NULL;")[0],
    /NOT NULL/,
  );
  assert.deepEqual(
    destructiveSql("ALTER TABLE a ADD COLUMN b TEXT NOT NULL DEFAULT '';"),
    [],
  );
  assert.deepEqual(destructiveSql("-- DROP TABLE a;\nSELECT 1;"), []);
});
