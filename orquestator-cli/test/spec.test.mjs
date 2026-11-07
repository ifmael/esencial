import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createIssue, specReview } from "../lib/spec.mjs";
import {
  readSpecMarker,
  specDefinition,
  specReady,
} from "../lib/spec-state.mjs";

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
    comments: {
      nodes: [
        {
          id: "c1",
          body: "En A4 y con los ejercicios agrupados.",
          createdAt: "2026-10-26T10:00:00Z",
        },
      ],
    },
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
        "## Definición actual\n\nExportar el plan en A4.\n\n## Preguntas\n\nSin preguntas: la spec está lista.",
      );
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(seen.phase, "spec-review");
  assert.match(seen.command, /> \/task\/spec-review\.md/);
  assert.equal(seen.repo, main);
  assert.match(seen.input, /Exportar el plan/);
  assert.match(seen.input, /Quiero el plan en PDF/);
  assert.match(seen.input, /En A4 y con los ejercicios agrupados/);
  assert.match(
    calls.find((c) => c.query.includes("commentCreate")).variables.body,
    /## Definición actual/,
  );
  assert.equal(result.issue.identifier, "ESN-7");
  assert.equal(readSpecMarker(dir, "ESN-7").status, "ready");
  assert.equal(
    readSpecMarker(dir, "ESN-7").definition,
    "Exportar el plan en A4.",
  );
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

test("specDefinition devuelve el bloque completo hasta el siguiente nivel 2", () => {
  const artifact = [
    "## Definición actual",
    "",
    "Párrafo uno.",
    "",
    "Párrafo dos con detalle.",
    "",
    "## Preguntas",
    "",
    "1. ¿En qué formato?",
  ].join("\n");
  assert.equal(
    specDefinition(artifact),
    "Párrafo uno.\n\nPárrafo dos con detalle.",
  );
});

test("specDefinition no corta en un encabezado de nivel 3", () => {
  const artifact = [
    "## Definición actual",
    "",
    "Párrafo uno.",
    "",
    "### Detalle",
    "",
    "Párrafo dos.",
  ].join("\n");
  assert.equal(
    specDefinition(artifact),
    artifact.split("\n").slice(2).join("\n"),
  );
});

test("specDefinition llega al final del artefacto sin bloque de preguntas", () => {
  const artifact = "## Definición actual\n\nPárrafo uno.\n\nPárrafo dos.";
  assert.equal(specDefinition(artifact), "Párrafo uno.\n\nPárrafo dos.");
});

test("specDefinition no incluye el aviso de que la spec está lista", () => {
  const artifact =
    "## Definición actual\n\nSpec final.\n\nSin preguntas: la spec está lista.";
  assert.equal(specDefinition(artifact), "Spec final.");
});

test("specDefinition devuelve null sin el encabezado de definición", () => {
  assert.equal(specDefinition("solo texto"), null);
  assert.equal(
    specDefinition("## Preguntas\n\nSin preguntas: la spec está lista."),
    null,
  );
  assert.equal(specDefinition(""), null);
});

test("specReady ignora la frase de listo dentro de bloques de código", () => {
  const artifact = [
    "```js",
    "const texto = 'Sin preguntas: la spec está lista.';",
    "```",
    "## Definición actual",
    "",
    "Arreglar la captura.",
    "",
    "## Preguntas",
    "",
    "1. ¿Se tolera el encabezado con NFD?",
    "",
  ].join("\n");
  assert.equal(specReady(artifact), false);
  assert.equal(
    specReady("## Preguntas\n\nSin preguntas: la spec está lista."),
    true,
  );
});
