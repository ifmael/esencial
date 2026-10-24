import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createIssue, specReview } from "../lib/spec.mjs";

function fakeFetch({
  states = ["Backlog", "Spec review", "Ready"],
  created = true,
} = {}) {
  const calls = [];
  const impl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.query.includes("teams(")) {
      return {
        ok: true,
        json: async () => ({
          data: {
            teams: {
              nodes: [
                {
                  id: "team-1",
                  key: "ESN",
                  states: {
                    nodes: states.map((name, i) => ({ id: `st-${i}`, name })),
                  },
                },
              ],
            },
          },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        data: {
          issueCreate: created
            ? {
                success: true,
                issue: {
                  id: "i1",
                  identifier: "ESN-9",
                  url: "https://x/ESN-9",
                },
              }
            : { success: false },
        },
      }),
    };
  };
  return { impl, calls };
}

test("createIssue crea la issue en Spec review y devuelve su clave", async () => {
  const { impl, calls } = fakeFetch();
  const issue = await createIssue(
    "k",
    { title: "Exportar en PDF", body: "Detalle" },
    impl,
  );
  assert.equal(issue.identifier, "ESN-9");
  assert.equal(calls[0].variables.key, "ESN");
  assert.equal(calls[1].variables.teamId, "team-1");
  assert.equal(calls[1].variables.stateId, "st-1");
  assert.equal(calls[1].variables.title, "Exportar en PDF");
  assert.equal(calls[1].variables.description, "Detalle");
});

test("createIssue falla claro si el equipo no tiene Spec review", async () => {
  const { impl } = fakeFetch({ states: ["Backlog", "Ready"] });
  await assert.rejects(
    () => createIssue("k", { title: "x", body: "" }, impl),
    /Spec review/,
  );
});

test("createIssue falla si Linear no confirma la creación", async () => {
  const { impl } = fakeFetch({ created: false });
  await assert.rejects(
    () => createIssue("k", { title: "x", body: "" }, impl),
    /no se creó/,
  );
});

test("specReview exige Spec review, escribe spec-review y comenta en la issue", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-spec-"));
  const main = path.join(dir, "main");
  fs.mkdirSync(main);
  const calls = [];
  const issue = {
    id: "uuid-7",
    identifier: "ESN-7",
    title: "Exportar el plan",
    description: "Quiero el plan en PDF.",
    state: { id: "st-1", name: "Spec review" },
  };
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const data = body.query.includes("commentCreate")
      ? { commentCreate: { success: true } }
      : { issues: { nodes: [issue] } };
    return { ok: true, json: async () => ({ data }) };
  };
  let seen;
  const result = await specReview("ESN-7", {
    apiKey: "lin_api_x",
    base: dir,
    main,
    fetchImpl,
    runner: (options) => {
      seen = options;
      fs.writeFileSync(
        path.join(options.task, "spec-review.md"),
        "Sin preguntas: la spec está lista.",
      );
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(seen.phase, "spec-review");
  assert.equal(seen.repo, main);
  assert.match(seen.input, /Exportar el plan/);
  assert.match(seen.input, /Quiero el plan en PDF/);
  assert.equal(
    calls.find((c) => c.query.includes("commentCreate")).variables.body,
    "Sin preguntas: la spec está lista.",
  );
  assert.equal(result.issue.identifier, "ESN-7");
  const hermes = path.join(dir, "ESN-7", "hermes", "spec-review");
  assert.match(
    fs.readFileSync(path.join(hermes, "SOUL.md"), "utf8"),
    /Identidad: revisor de especificación/,
  );
  assert.match(
    fs.readFileSync(path.join(hermes, "config.yaml"), "utf8"),
    /reasoning_effort: max/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
