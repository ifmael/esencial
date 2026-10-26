import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  approveMigrationPr,
  approveMigrationTask,
  migratePr,
  migrateTask,
} from "../lib/migrate.mjs";
import { createState, load, repoDir, save, transition } from "../lib/state.mjs";

const KEY = "ESN-7";
const DB_CONFIG = `name = "esencial-api"
[[d1_databases]]
binding = "DB"
database_name = "esencial"
database_id = "db-test"
migrations_dir = "migrations"
`;

let dir;
let base;
let main;
let task;
let calls;

function gitIn(cwd, ...args) {
  return execFileSync(
    "git",
    ["-c", "user.email=t@test", "-c", "user.name=Test", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function commit(cwd, file, text) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), text);
  gitIn(cwd, "add", ".");
  gitIn(cwd, "commit", "-q", "-m", `edit ${file}`);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-migrate-"));
  main = path.join(dir, "main");
  base = path.join(dir, "home");
  const origin = path.join(dir, "origin.git");
  gitIn(dir, "init", "-q", "--bare", origin);
  gitIn(dir, "clone", "-q", origin, main);
  gitIn(main, "switch", "-q", "-c", "main");
  commit(main, "api/wrangler.toml", DB_CONFIG);
  commit(main, "api/migrations/0001_base.sql", "CREATE TABLE base (id);\n");
  gitIn(main, "push", "-q", "origin", "main");

  task = repoDir(KEY, base);
  fs.mkdirSync(path.join(base, KEY), { recursive: true });
  gitIn(base, "clone", "-q", main, task);
  gitIn(task, "switch", "-q", "-c", `${KEY}-algo`);
  commit(task, "api/migrations/0002_nueva.sql", "CREATE TABLE nueva (id);\n");
  gitIn(base, "clone", "-q", "--bare", origin, path.join(base, "upstream.git"));
  save(
    KEY,
    transition(
      {
        ...createState(KEY),
        branch: `${KEY}-algo`,
        pr: { number: 9, url: "u" },
      },
      "In Progress",
    ),
    base,
  );
  calls = [];
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function wrangler(args) {
  calls.push(args);
  if (args[2] === "list") {
    return "✅ No migrations to apply!";
  }
  return "";
}

function ghRun(args) {
  calls.push(args);
  if (args[0] === "run" && args[1] === "list") {
    return JSON.stringify([
      { databaseId: 7, status: "completed", conclusion: "failure", url: "u" },
    ]);
  }
  if (args[0] === "run" && args[1] === "rerun") return "";
  if (args[0] === "run" && args[1] === "watch") return "";
  throw new Error(`gh inesperado: ${args.join(" ")}`);
}

function options(extra = {}) {
  return {
    base,
    main,
    env: { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a" },
    wrangler,
    ghRun,
    checksRun: () => ({ status: 0 }),
    out: () => {},
    ...extra,
  };
}

test("migrate exige aprobación y aplica solo lo aprobado", () => {
  assert.throws(() => migrateTask(KEY, options()), /Falta approve --migracion/);
  const approved = approveMigrationTask(KEY, {
    ...options(),
    isTTY: true,
    reason: "aditiva",
  });
  assert.equal(approved.files.length, 1);
  const result = migrateTask(KEY, options());
  assert.equal(result.files.length, 1);
  assert.match(
    calls.find((args) => args[0] === "d1" && args[2] === "apply").join(" "),
    /--remote/,
  );
  assert.equal(load(KEY, base).state, "In validation");
});

test("migrate --dry-run no aplica ni exige credenciales", () => {
  approveMigrationTask(KEY, {
    ...options(),
    isTTY: true,
    reason: "aditiva",
  });
  const result = migrateTask(KEY, options({ dryRun: true, env: {} }));
  assert.equal(result.dryRun, true);
  assert.equal(
    calls.some((args) => args[0] === "d1"),
    false,
  );
});

test("una migración aplicada no se puede cambiar", () => {
  commit(
    task,
    "api/migrations/0001_base.sql",
    "CREATE TABLE base (id, otro);\n",
  );
  approveMigrationTask(KEY, {
    ...options(),
    isTTY: true,
    reason: "aditiva",
  });
  assert.throws(
    () => migrateTask(KEY, options()),
    /migración aplicada .* cambió/,
  );
  assert.equal(load(KEY, base).state, "Blocked");
});

test("DROP exige --force pero el dry-run lo enseña", () => {
  commit(task, "api/migrations/0002_nueva.sql", "DROP TABLE base;\n");
  approveMigrationTask(KEY, {
    ...options(),
    isTTY: true,
    reason: "limpia",
  });
  assert.throws(() => migrateTask(KEY, options()), /--force/);
  assert.equal(migrateTask(KEY, options({ dryRun: true })).dryRun, true);
  migrateTask(KEY, options({ force: true }));
  assert.ok(calls.some((args) => args[0] === "d1" && args[2] === "apply"));
});

test("migrate no aplica si hay una pendiente ajena", () => {
  approveMigrationTask(KEY, {
    ...options(),
    isTTY: true,
    reason: "aditiva",
  });
  const foreign = (args) => {
    calls.push(args);
    if (args[2] === "list") return "0001_base.sql";
    return "";
  };
  assert.throws(
    () => migrateTask(KEY, options({ wrangler: foreign })),
    /sin aprobar: 0001_base.sql/,
  );
  assert.equal(
    calls.some((args) => args[0] === "d1" && args[2] === "apply"),
    false,
  );
});

test("migrate --pr usa la aprobación de la PR", () => {
  const prFiles = [
    {
      file: "api/migrations/0002_nueva.sql",
      sql: "CREATE TABLE nueva (id);\n",
    },
  ];
  const gh = (args) => {
    calls.push(args);
    if (args[0] === "pr" && args[1] === "view") {
      return JSON.stringify({
        number: 42,
        headRefName: "feature",
        headRefOid: "abc",
        baseRefName: "main",
      });
    }
    if (args[0] === "pr" && args[1] === "diff") {
      return prFiles[0].file;
    }
    if (args[0] === "api") return prFiles[0].sql;
    return ghRun(args);
  };
  approveMigrationPr(42, {
    ...options(),
    ghRun: gh,
    isTTY: true,
    reason: "aditiva",
  });
  const result = migratePr(42, options({ ghRun: gh }));
  assert.equal(result.files.length, 1);
  assert.equal(
    fs.existsSync(path.join(base, "approvals", "pr-42-migration.json")),
    true,
  );
});
