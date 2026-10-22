import assert from "node:assert/strict";
import { test } from "node:test";

import {
  commentArgs,
  createArgs,
  editArgs,
  reviewArgs,
  statusArgs,
  viewArgs,
} from "../lib/github.mjs";

test("statusArgs publica el contexto guard sobre el SHA", () => {
  const args = statusArgs("abc123", "success", "aprobado");
  assert.deepEqual(args.slice(0, 3), [
    "api",
    "repos/{owner}/{repo}/statuses/abc123",
    "-f",
  ]);
  assert.ok(args.includes("context=guard"));
  assert.ok(args.includes("state=success"));
  assert.ok(args.includes("description=aprobado"));
});

test("createArgs usa el body-file, main y la rama", () => {
  const args = createArgs("ESN-7 algo", "/tmp/b.md", "ESN-7-algo");
  assert.deepEqual(args, [
    "pr",
    "create",
    "--title",
    "ESN-7 algo",
    "--body-file",
    "/tmp/b.md",
    "--base",
    "main",
    "--head",
    "ESN-7-algo",
  ]);
});

test("editArgs, viewArgs y commentArgs apuntan a la rama o la PR", () => {
  assert.deepEqual(editArgs("ESN-7-algo", "/tmp/b.md"), [
    "pr",
    "edit",
    "ESN-7-algo",
    "--body-file",
    "/tmp/b.md",
  ]);
  assert.deepEqual(viewArgs("ESN-7-algo").slice(0, 3), [
    "pr",
    "view",
    "ESN-7-algo",
  ]);
  assert.deepEqual(commentArgs("ESN-7-algo", "/tmp/r.md"), [
    "pr",
    "comment",
    "ESN-7-algo",
    "--body-file",
    "/tmp/r.md",
  ]);
});

test("reviewArgs publica review.md como review", () => {
  assert.deepEqual(reviewArgs(9, "/tmp/r.md"), [
    "pr",
    "review",
    "9",
    "--comment",
    "--body-file",
    "/tmp/r.md",
  ]);
});
