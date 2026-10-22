import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { load } from "../lib/state.mjs";
import { ARTIFACTS, slugify, startTask } from "../lib/task.mjs";

let dir;
let source;
const KEY = "ESN-7";

function gitIn(cwd, ...args) {
  execFileSync(
    "git",
    ["-c", "user.email=t@test", "-c", "user.name=Test", ...args],
    {
      cwd,
      stdio: "ignore",
    },
  );
}

function fakeFetch(issue = {}) {
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.query.includes("issues(filter")) {
      return {
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: [
                {
                  id: "uuid-7",
                  identifier: KEY,
                  title: issue.title ?? "Exportar el plan en PDF",
                  description: "Quiero llevarlo impreso.",
                  state: { id: "st-1", name: issue.state ?? "Ready" },
                  team: { id: "team-1", key: "ESN" },
                },
              ],
            },
          },
        }),
      };
    }
    if (body.query.includes("team(id")) {
      return {
        ok: true,
        json: async () => ({
          data: {
            team: { states: { nodes: [{ id: "st-2", name: "In Progress" }] } },
          },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({ data: { issueUpdate: {}, commentCreate: {} } }),
    };
  };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-task-"));
  source = path.join(dir, "source");
  fs.mkdirSync(source);
  gitIn(source, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(source, "README.md"), "hola");
  gitIn(source, "add", ".");
  gitIn(source, "commit", "-q", "-m", "init");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test("slugify quita tildes y signos y recorta", () => {
  assert.equal(slugify("Exportar el plan en PDF"), "exportar-el-plan-en-pdf");
  assert.equal(slugify("¡Añadir sesión de fuerza!"), "anadir-sesion-de-fuerza");
  assert.ok(slugify("x".repeat(80)).length <= 48);
});

test("startTask crea clon, rama, artefactos, mueve Linear y guarda estado", async () => {
  const lines = [];
  const state = await startTask(KEY, {
    apiKey: "k",
    fetchImpl: fakeFetch(),
    source,
    base: dir,
    out: (t) => lines.push(t),
  });
  assert.equal(state.state, "In Progress");
  assert.equal(state.branch, `${KEY}-exportar-el-plan-en-pdf`);
  assert.equal(state.issueId, "uuid-7");
  assert.equal(load(KEY, dir).state, "In Progress");
  const repo = path.join(dir, KEY, "repo");
  assert.equal(
    execFileSync("git", ["branch", "--show-current"], {
      cwd: repo,
      encoding: "utf8",
    }).trim(),
    state.branch,
  );
  const task = path.join(dir, KEY, "task");
  for (const name of ARTIFACTS)
    assert.ok(fs.existsSync(path.join(task, name)), name);
  assert.match(
    fs.readFileSync(path.join(task, "brief.md"), "utf8"),
    /Exportar el plan en PDF/,
  );
  assert.match(lines.join("\n"), new RegExp(state.branch));
});

test("startTask exige que la issue esté en Ready", async () => {
  await assert.rejects(
    () =>
      startTask(KEY, {
        apiKey: "k",
        fetchImpl: fakeFetch({ state: "Backlog" }),
        source,
        base: dir,
      }),
    /está en Backlog/,
  );
  assert.equal(load(KEY, dir), null);
  assert.equal(fs.existsSync(path.join(dir, KEY, "repo")), false);
});
