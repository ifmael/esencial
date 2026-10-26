import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ciDecision,
  isApprovedStatus,
} from "../../.github/scripts/guard-ci.mjs";
import { parsePaths } from "../lib/guard.mjs";

const RULES = parsePaths("AGENTS.md\n.github/workflows/\n");

test("guard-ci solo acepta el contexto gh-guard en success", () => {
  assert.equal(
    isApprovedStatus([{ context: "guard", state: "success" }]),
    false,
  );
  assert.equal(
    isApprovedStatus([{ context: "gh-guard", state: "pending" }]),
    false,
  );
  assert.equal(
    isApprovedStatus([{ context: "gh-guard", state: "success" }]),
    true,
  );
});

test("guard-ci exige status para una ruta protegida normal", () => {
  const decision = ciDecision(["AGENTS.md", "README.md"], RULES);
  assert.deepEqual(decision.touched, ["AGENTS.md"]);
  assert.equal(decision.requiresGuard, true);
});

test("guard-ci no exige status si no hay rutas protegidas", () => {
  assert.equal(ciDecision(["README.md"], RULES).requiresGuard, false);
});

test("guard-ci deja pasar los cambios de CI para revisión humana", () => {
  const decision = ciDecision([".github/workflows/ci.yml"], RULES);
  assert.equal(decision.workflows, true);
  assert.equal(decision.requiresGuard, false);
});

test("guard-ci también deja la mezcla con CI a revisión humana", () => {
  const decision = ciDecision([".github/workflows/ci.yml", "AGENTS.md"], RULES);
  assert.equal(decision.requiresGuard, false);
});
