import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { imageTag } from "../lib/image.mjs";

let dir;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test("imageTag es el mismo hash que build.sh (Dockerfile + lockfile)", () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-img-"));
  fs.mkdirSync(path.join(dir, "orquestator-cli"));
  fs.writeFileSync(path.join(dir, "orquestator-cli", "Dockerfile"), "FROM x\n");
  fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
  const expected = createHash("sha256")
    .update("FROM x\nlockfileVersion: 9\n")
    .digest("hex")
    .slice(0, 12);
  assert.equal(imageTag({ cwd: dir }), `esencial-worker:${expected}`);
});

test("ORQUESTATOR_IMAGE manda sobre el hash", () => {
  const previous = process.env.ORQUESTATOR_IMAGE;
  process.env.ORQUESTATOR_IMAGE = "esencial-worker:manual";
  try {
    assert.equal(imageTag(), "esencial-worker:manual");
  } finally {
    if (previous === undefined) delete process.env.ORQUESTATOR_IMAGE;
    else process.env.ORQUESTATOR_IMAGE = previous;
  }
});
