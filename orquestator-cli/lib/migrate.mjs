import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { git } from "./checkout.mjs";
import { readEnv } from "./config.mjs";
import { runChecks, runGh } from "./github.mjs";
import { diffFiles, importBranch } from "./guard.mjs";
import {
  destructiveSql,
  hashMigrations,
  migrationsOf,
  releaseMigration,
  reserveMigration,
} from "./migrations.mjs";
import { block, home, load, repoDir, save, transition } from "./state.mjs";
import { runWrangler } from "./wrangler.mjs";

export const MIGRATION_DB = "esencial";
const APPROVALS = "approvals";

function now() {
  return new Date().toISOString();
}

function databaseId(main) {
  const file = path.join(main, "api", "wrangler.toml");
  const text = fs.readFileSync(file, "utf8");
  const match = /database_id\s*=\s*"([^"]+)"/.exec(text);
  if (!match) throw new Error(`No encuentro database_id en ${file}`);
  return match[1];
}

function taskMigrations(key, { base, main, baseRef }) {
  const state = load(key, base);
  if (!state) throw new Error(`La tarea ${key} no existe`);
  if (!state.branch) throw new Error(`La tarea ${key} no tiene rama`);
  const repo = repoDir(key, base);
  if (!fs.existsSync(repo)) throw new Error(`Falta el clon: ${repo}`);
  const ref = importBranch({
    main,
    mirror: path.join(base, "upstream.git"),
    repo,
    branch: state.branch,
    key,
  });
  const files = migrationsOf(diffFiles({ main, ref, baseRef }));
  const entries = files.map((file) => ({
    file,
    sql: git(["show", `${ref}:${file}`], { cwd: main }),
  }));
  return {
    state,
    files,
    entries,
    hash: entries.length ? hashMigrations(entries) : null,
  };
}

function prInfo(number, ghRun) {
  return JSON.parse(
    ghRun([
      "pr",
      "view",
      String(number),
      "--json",
      "number,headRefName,headRefOid,baseRefName",
    ]),
  );
}

function prContent(file, sha, ghRun) {
  const encoded = file.split("/").map(encodeURIComponent).join("/");
  return ghRun([
    "api",
    `repos/{owner}/{repo}/contents/${encoded}?ref=${sha}`,
    "-H",
    "Accept: application/vnd.github.raw",
  ]);
}

function prMigrations(number, { ghRun }) {
  const pr = prInfo(number, ghRun);
  const files = migrationsOf(
    ghRun(["pr", "diff", String(number), "--name-only"])
      .split("\n")
      .filter(Boolean),
  );
  const entries = files.map((file) => ({
    file,
    sql: prContent(file, pr.headRefOid, ghRun),
  }));
  return {
    pr,
    files,
    entries,
    hash: entries.length ? hashMigrations(entries) : null,
  };
}

function approvalFile(number, base) {
  return path.join(base, APPROVALS, `pr-${number}-migration.json`);
}

function assertApproved({ hash, approval, command }) {
  if (!approval || approval.hash !== hash) {
    throw new Error(`Falta approve --migracion (${command})`);
  }
}

function assertImmutable(entries, { main, baseRef }) {
  for (const entry of entries) {
    let baseSql;
    try {
      baseSql = git(["show", `${baseRef}:${entry.file}`], { cwd: main });
    } catch {
      continue;
    }
    if (baseSql.trimEnd() !== entry.sql.trimEnd()) {
      throw new Error(
        `La migración aplicada ${entry.file} cambió; una migración aplicada es inmutable`,
      );
    }
  }
}

function assertNoDestructive(entries, force) {
  const warnings = entries.flatMap((entry) =>
    destructiveSql(entry.sql).map((reason) => `${entry.file}: ${reason}`),
  );
  if (warnings.length && !force) {
    throw new Error(
      `Migración destructiva; revisa y repite con --force:\n${warnings.join("\n")}`,
    );
  }
  return warnings;
}

function stage(entries, { main }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-migrate-"));
  const migrations = path.join(dir, "migrations");
  fs.mkdirSync(migrations);
  for (const entry of entries) {
    fs.writeFileSync(
      path.join(migrations, path.basename(entry.file)),
      entry.sql,
    );
  }
  const config = path.join(dir, "wrangler.toml");
  fs.writeFileSync(
    config,
    [
      'name = "esencial-api-migrate"',
      "[[d1_databases]]",
      'binding = "DB"',
      `database_name = "${MIGRATION_DB}"`,
      `database_id = "${databaseId(main)}"`,
      'migrations_dir = "migrations"',
      "",
    ].join("\n"),
  );
  return { dir, config };
}

function applyMigrations(entries, { main, env, wrangler, out }) {
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error(
      "Falta CLOUDFLARE_API_TOKEN (en ~/.config/orquestator/env); se necesita un token de edición de D1",
    );
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error(
      "Falta CLOUDFLARE_ACCOUNT_ID (en ~/.config/orquestator/env)",
    );
  }
  const { dir, config } = stage(entries, { main });
  try {
    out(
      `Aplicando ${entries.map((entry) => entry.file).join(", ")} en D1 remota`,
    );
    wrangler(
      ["d1", "migrations", "apply", MIGRATION_DB, "--remote", "-c", config],
      { cwd: dir, env, main },
    );
    const pending = wrangler(
      ["d1", "migrations", "list", MIGRATION_DB, "--remote", "-c", config],
      { cwd: dir, env, main },
    );
    if (!/No migrations to apply/i.test(pending)) {
      throw new Error("Quedan migraciones pendientes después de aplicar");
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function rerunMigrationJob(branch, { ghRun, out }) {
  const runs = JSON.parse(
    ghRun([
      "run",
      "list",
      "--branch",
      branch,
      "--limit",
      "1",
      "--json",
      "databaseId,status,conclusion,url",
    ]) || "[]",
  );
  if (!runs.length) throw new Error(`No hay ejecuciones de CI para ${branch}`);
  const run = runs[0];
  if (run.status === "in_progress" || run.status === "queued") {
    throw new Error(`La CI de ${branch} aún está corriendo; espera y repite`);
  }
  if (run.conclusion === "success") {
    out(`CI de ${branch}: ya estaba verde`);
    return { rerun: false, id: run.databaseId };
  }
  ghRun(["run", "rerun", String(run.databaseId), "--failed"]);
  out(`CI de ${branch}: job migracion re-ejecutado (${run.databaseId})`);
  return { rerun: true, id: run.databaseId };
}

function waitRun(id, { ghRun }) {
  ghRun(["run", "watch", String(id), "--exit-status", "--interval", "10"]);
}

function approve({
  isTTY,
  reason,
  hash,
  files,
  base,
  number,
  sha,
  dryRun,
  out,
}) {
  const text = String(reason ?? "").trim();
  if (dryRun) {
    out(`[dry-run] aprobaría ${files.join(", ")} (${hash.slice(0, 12)})`);
    return { dryRun: true, hash, files };
  }
  if (!isTTY) throw new Error("approve solo se puede usar desde una terminal");
  if (!text) throw new Error('approve necesita un motivo (--motivo "…")');
  const record = { hash, files, reason: text, at: now() };
  if (number) {
    fs.mkdirSync(path.join(base, APPROVALS), { recursive: true });
    fs.writeFileSync(
      approvalFile(number, base),
      `${JSON.stringify({ ...record, sha }, null, 2)}\n`,
      { mode: 0o600 },
    );
    out(`PR #${number}: migración aprobada ${hash.slice(0, 12)}`);
    return { approved: true, hash, files };
  }
  return { approved: true, hash, files };
}

export function approveMigrationTask(
  key,
  {
    base = home(),
    main = process.cwd(),
    baseRef = "origin/main",
    isTTY,
    reason,
    dryRun,
    out = () => {},
  } = {},
) {
  const found = taskMigrations(key, { base, main, baseRef });
  if (!found.entries.length)
    throw new Error(`La tarea ${key} no toca migraciones`);
  const result = approve({
    isTTY,
    reason,
    hash: found.hash,
    files: found.files,
    base,
    dryRun,
    out,
  });
  if (result.dryRun) return result;
  save(
    key,
    {
      ...found.state,
      approvals: {
        ...found.state.approvals,
        migration: {
          hash: found.hash,
          files: found.files,
          reason: String(reason).trim(),
          at: now(),
        },
      },
    },
    base,
  );
  out(`Migración aprobada ${found.hash.slice(0, 12)}`);
  return { approved: true, hash: found.hash, files: found.files };
}

export function approveMigrationPr(
  number,
  { base = home(), ghRun = runGh, isTTY, reason, dryRun, out = () => {} } = {},
) {
  const found = prMigrations(number, { ghRun });
  if (!found.entries.length)
    throw new Error(`La PR #${number} no toca migraciones`);
  return approve({
    isTTY,
    reason,
    hash: found.hash,
    files: found.files,
    base,
    number,
    sha: found.pr.headRefOid,
    dryRun,
    out,
  });
}

export function migrateTask(
  key,
  {
    base = home(),
    main = process.cwd(),
    baseRef = "origin/main",
    dryRun,
    force,
    waitChecks = true,
    out = () => {},
    wrangler = runWrangler,
    ghRun = runGh,
    checksRun = runChecks,
    env = { ...readEnv(), ...process.env },
  } = {},
) {
  const found = taskMigrations(key, { base, main, baseRef });
  if (!found.entries.length)
    throw new Error(`La tarea ${key} no toca migraciones`);
  assertApproved({
    hash: found.hash,
    approval: found.state.approvals?.migration,
    command: `orquestator approve ${key} --migracion --motivo "…"`,
  });
  try {
    assertImmutable(found.entries, { main, baseRef });
  } catch (error) {
    if (!dryRun) {
      const current = load(key, base);
      if (["In Progress", "In validation"].includes(current.state)) {
        save(key, block(current, error.message), base);
      }
    }
    throw error;
  }
  const warnings = assertNoDestructive(found.entries, force || dryRun);
  if (dryRun) {
    out(`[dry-run] aplicaría ${found.files.join(", ")} en D1 remota`);
    for (const warning of warnings) out(`[dry-run] destructiva: ${warning}`);
    return { dryRun: true, files: found.files, hash: found.hash };
  }
  if (!found.state.pr?.number) {
    throw new Error(`La tarea ${key} no tiene PR; ejecuta pr primero`);
  }
  reserveMigration({ base, key, files: found.files });
  applyMigrations(found.entries, { main, env, wrangler, out });
  const state = load(key, base);
  save(
    key,
    {
      ...state,
      migrations: {
        last: { hash: found.hash, files: found.files, at: now() },
      },
    },
    base,
  );
  const { rerun, id } = rerunMigrationJob(state.branch, { ghRun, out });
  if (waitChecks) {
    if (rerun) waitRun(id, { ghRun });
    const checks = checksRun(state.pr.number);
    if (checks.status !== 0) {
      throw new Error(`La CI de la PR #${state.pr.number} no está verde`);
    }
  }
  if (state.state === "In Progress") {
    save(key, transition(load(key, base), "In validation"), base);
    out(`${key}: In validation`);
  }
  return { files: found.files, hash: found.hash, rerun };
}

export function migratePr(
  number,
  {
    base = home(),
    main = process.cwd(),
    baseRef = "origin/main",
    dryRun,
    force,
    waitChecks = true,
    out = () => {},
    wrangler = runWrangler,
    ghRun = runGh,
    checksRun = runChecks,
    env = { ...readEnv(), ...process.env },
  } = {},
) {
  const found = prMigrations(number, { ghRun });
  if (!found.entries.length)
    throw new Error(`La PR #${number} no toca migraciones`);
  let approval = null;
  try {
    approval = JSON.parse(fs.readFileSync(approvalFile(number, base), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  assertApproved({
    hash: found.hash,
    approval,
    command: `orquestator approve --pr ${number} --migracion --motivo "…"`,
  });
  assertImmutable(found.entries, { main, baseRef });
  const warnings = assertNoDestructive(found.entries, force || dryRun);
  if (dryRun) {
    out(`[dry-run] aplicaría ${found.files.join(", ")} en D1 remota`);
    for (const warning of warnings) out(`[dry-run] destructiva: ${warning}`);
    return { dryRun: true, files: found.files, hash: found.hash };
  }
  reserveMigration({ base, key: `PR-${number}`, files: found.files });
  try {
    applyMigrations(found.entries, { main, env, wrangler, out });
  } finally {
    releaseMigration({ base, key: `PR-${number}` });
  }
  const { rerun, id } = rerunMigrationJob(found.pr.headRefName, { ghRun, out });
  if (waitChecks) {
    if (rerun) waitRun(id, { ghRun });
    const checks = checksRun(number);
    if (checks.status !== 0) {
      throw new Error(`La CI de la PR #${number} no está verde`);
    }
  }
  return { files: found.files, hash: found.hash, rerun };
}
