import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
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
