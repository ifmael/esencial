import assert from "node:assert/strict";
import { test } from "node:test";

import {
  comment,
  getIssue,
  notifyBlocked,
  readyIssues,
  request,
  setState,
  specReviewIssues,
  updateDescription,
} from "../lib/linear.mjs";

function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    const data = handler(body);
    return { ok: true, json: async () => ({ data }) };
  };
  return { impl, calls };
}

const ISSUE = {
  id: "uuid-1",
  identifier: "ESN-7",
  title: "Exportar el plan en PDF",
  description: "Quiero llevarlo impreso.",
  state: { id: "st-1", name: "Ready" },
  team: { id: "team-1", key: "ESN" },
};

test("request manda la clave sin Bearer y devuelve data", async () => {
  const { impl, calls } = fakeFetch(() => ({ ping: "pong" }));
  const data = await request("lin_api_x", "query { ping }", {}, impl);
  assert.deepEqual(data, { ping: "pong" });
  assert.equal(calls[0].url, "https://api.linear.app/graphql");
  assert.equal(calls[0].headers.Authorization, "lin_api_x");
});

test("request convierte errors de GraphQL en excepción", async () => {
  const impl = async () => ({
    ok: true,
    json: async () => ({ errors: [{ message: "boom" }] }),
  });
  await assert.rejects(() => request("k", "q", {}, impl), /boom/);
});

test("readyIssues pide al equipo las issues en Ready", async () => {
  const { impl, calls } = fakeFetch(() => ({
    issues: { nodes: [{ identifier: "ESN-1", title: "Una" }] },
  }));
  const nodes = await readyIssues("k", "ESN", impl);
  assert.equal(nodes[0].identifier, "ESN-1");
  assert.equal(calls[0].body.variables.team, "ESN");
  assert.match(calls[0].body.query, /state:\{name:\{eq:"Ready"\}\}/);
});

test("specReviewIssues pide las issues en Spec review con su descripción", async () => {
  const { impl, calls } = fakeFetch(() => ({
    issues: {
      nodes: [{ identifier: "ESN-1", description: "Falta decidir X." }],
    },
  }));
  const nodes = await specReviewIssues("k", "ESN", impl);
  assert.equal(nodes[0].description, "Falta decidir X.");
  assert.equal(calls[0].body.variables.team, "ESN");
  assert.match(calls[0].body.query, /state:\{name:\{eq:"Spec review"\}\}/);
  assert.match(calls[0].body.query, /description/);
  assert.match(calls[0].body.query, /comments/);
});

test("getIssue busca por número y equipo", async () => {
  const { impl, calls } = fakeFetch(() => ({ issues: { nodes: [ISSUE] } }));
  const issue = await getIssue("k", "ESN-7", impl);
  assert.equal(issue.title, "Exportar el plan en PDF");
  assert.equal(calls[0].body.variables.team, "ESN");
  assert.equal(calls[0].body.variables.number, 7);
});

test("getIssue falla si la issue no existe", async () => {
  const { impl } = fakeFetch(() => ({ issues: { nodes: [] } }));
  await assert.rejects(() => getIssue("k", "ESN-99", impl), /no existe/);
});

test("setState resuelve el id del estado por nombre", async () => {
  const { impl, calls } = fakeFetch((body) => {
    if (body.query.includes("team(id")) {
      return {
        team: { states: { nodes: [{ id: "st-2", name: "In Progress" }] } },
      };
    }
    return { issueUpdate: { success: true } };
  });
  await setState("k", ISSUE, "In Progress", impl);
  assert.equal(calls[0].body.variables.id, "team-1");
  assert.equal(calls[1].body.variables.stateId, "st-2");
  assert.equal(calls[1].body.variables.id, "uuid-1");
});

test("setState rechaza un estado que el equipo no tiene", async () => {
  const { impl } = fakeFetch((body) => {
    if (body.query.includes("team(id")) {
      return {
        team: { states: { nodes: [{ id: "st-2", name: "In Progress" }] } },
      };
    }
    return {};
  });
  await assert.rejects(
    () => setState("k", ISSUE, "Terminado", impl),
    /no tiene el estado/,
  );
});

test("updateDescription reescribe la descripción", async () => {
  const { impl, calls } = fakeFetch(() => ({
    issueUpdate: { success: true },
  }));
  await updateDescription("k", ISSUE, "Texto limpio.", impl);
  assert.equal(calls[0].body.variables.id, "uuid-1");
  assert.equal(calls[0].body.variables.description, "Texto limpio.");
  assert.match(calls[0].body.query, /description:\$description/);
});

test("comment crea el comentario en la issue", async () => {
  const { impl, calls } = fakeFetch(() => ({
    commentCreate: { success: true },
  }));
  await comment("k", ISSUE, "Rama: ESN-7-x", impl);
  assert.equal(calls[0].body.variables.issueId, "uuid-1");
  assert.equal(calls[0].body.variables.body, "Rama: ESN-7-x");
});

test("notifyBlocked asigna la issue a ti y te menciona", async () => {
  const { impl, calls } = fakeFetch((body) => {
    if (body.query.includes("viewer")) {
      return { viewer: { id: "u1", name: "Ismael", email: "i@x" } };
    }
    return { issueUpdate: { success: true }, commentCreate: { success: true } };
  });
  const me = await notifyBlocked("k", ISSUE, "¿Qué tabla?", impl);
  assert.equal(me.id, "u1");
  assert.equal(calls[1].body.variables.userId, "u1");
  assert.match(calls[2].body.variables.body, /mention:\/\/user\/u1/);
});
