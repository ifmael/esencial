import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { approvePr } from "../lib/manual.mjs";

const RULES = "AGENTS.md\n!.github/workflows/\norquestator-cli/\n";
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-manual-"));
  fs.mkdirSync(path.join(dir, "repo", "orquestator-cli"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "repo", "orquestator-cli", "protected-paths.txt"),
    RULES,
  );
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function fakeGh(files, patch = "diff") {
  const calls = [];
  const ghRun = (args) => {
    calls.push(args);
    if (args[1] === "view") {
      return JSON.stringify({
        number: 5,
        url: "u",
        headRefOid: "sha5",
        mergeable: "MERGEABLE",
      });
    }
    if (args[1] === "diff")
      return args.includes("--name-only") ? files.join("\n") : patch;
    return "";
  };
  return { ghRun, calls };
}

function approve(n, opts) {
  return approvePr(n, { main: path.join(dir, "repo"), base: dir, ...opts });
}

test("sin rutas protegidas no hay que aprobar y publica el status", () => {
  const { ghRun, calls } = fakeGh(["src/x.ts"]);
  const result = approve(5, { ghRun });
  assert.equal(result.approved, false);
  const status = calls.find((a) => a[0] === "api");
  assert.ok(status[1].endsWith("/sha5"));
  assert.ok(status.some((a) => a.includes("sin rutas protegidas")));
});

test("con rutas protegidas exige TTY y motivo, y guarda el hash", () => {
  const { ghRun } = fakeGh(["AGENTS.md"], "parche");
  assert.throws(
    () => approve(5, { ghRun, isTTY: false, reason: "x" }),
    /terminal/,
  );
  assert.throws(
    () => approve(5, { ghRun, isTTY: true, reason: " " }),
    /motivo/,
  );
  const result = approve(5, { ghRun, isTTY: true, reason: "lo reviso" });
  assert.equal(result.approved, true);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "approvals", "pr-5.json"), "utf8"),
  );
  assert.equal(saved.hash, result.hash);
  assert.equal(saved.reason, "lo reviso");
});

test(".github/workflows no se aprueba nunca", () => {
  const { ghRun } = fakeGh([".github/workflows/ci.yml"]);
  assert.throws(
    () => approve(5, { ghRun, isTTY: true, reason: "x" }),
    /no aprobables/,
  );
});
