import assert from "node:assert/strict";
import { test } from "node:test";

import { createIssue } from "../lib/spec.mjs";

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
