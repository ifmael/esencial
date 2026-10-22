import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  ARTIFACTS,
  ensureArtifacts,
  listArtifacts,
  readArtifact,
  writeArtifact,
} from "../lib/artifacts.mjs";

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-art-"));
  process.env.ORQUESTATOR_HOME = dir;
});
afterEach(() => {
  delete process.env.ORQUESTATOR_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ensureArtifacts crea todos vacíos y no pisa lo escrito", () => {
  ensureArtifacts("ESN-7");
  for (const name of ARTIFACTS) assert.equal(readArtifact("ESN-7", name), "");
  writeArtifact("ESN-7", "checks.md", "PASS");
  ensureArtifacts("ESN-7");
  assert.equal(readArtifact("ESN-7", "checks.md"), "PASS");
});

test("writeArtifact y readArtifact van y vuelven", () => {
  writeArtifact("ESN-7", "review.md", "crítico: falta un test");
  assert.equal(readArtifact("ESN-7", "review.md"), "crítico: falta un test");
});

test("no se puede leer ni escribir fuera de los artefactos", () => {
  assert.throws(
    () => readArtifact("ESN-7", "../state.json"),
    /Artefacto desconocido/,
  );
  assert.throws(
    () => writeArtifact("ESN-7", "/etc/passwd", "x"),
    /Artefacto desconocido/,
  );
  assert.throws(() => readArtifact("ESN-7", "impl.md"), /no existe/);
});

test("listArtifacts dice cuáles tienen contenido", () => {
  ensureArtifacts("ESN-7");
  writeArtifact("ESN-7", "brief.md", "# tarea");
  const listed = listArtifacts("ESN-7");
  assert.deepEqual(
    listed.find((a) => a.name === "brief.md"),
    { name: "brief.md", filled: true },
  );
  assert.equal(listed.find((a) => a.name === "checks.md").filled, false);
});
