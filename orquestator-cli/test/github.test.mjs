import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  appJwt,
  commentArgs,
  createArgs,
  editArgs,
  gitAuthEnv,
  githubUrl,
  installationToken,
  reviewArgs,
  runChecks,
  statusArgs,
  viewArgs,
} from "../lib/github.mjs";

test("githubUrl convierte el remoto SSH y conserva el HTTPS", () => {
  assert.equal(
    githubUrl("git@github.com:ifmael/esencial.git"),
    "https://github.com/ifmael/esencial.git",
  );
  assert.equal(
    githubUrl("https://github.com/ifmael/esencial.git"),
    "https://github.com/ifmael/esencial.git",
  );
  assert.equal(githubUrl("/tmp/origin.git"), null);
});

test("gitAuthEnv no imprime el token y configura el helper", () => {
  const env = gitAuthEnv("tok");
  assert.equal(env.GH_TOKEN, "tok");
  assert.match(env.GIT_CONFIG_VALUE_0, /password=\$GH_TOKEN/);
});

test("statusArgs publica el contexto gh-guard sobre el SHA", () => {
  const args = statusArgs("abc123", "success", "aprobado");
  assert.deepEqual(args.slice(0, 3), [
    "api",
    "repos/{owner}/{repo}/statuses/abc123",
    "-f",
  ]);
  assert.ok(args.includes("context=gh-guard"));
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

test("runChecks solo tolera la migración cuando se pide", () => {
  const spawn = () => ({
    status: 1,
    stdout: "ci\tpass\nmigracion\tfail\n",
    stderr: "",
  });
  const allowed = runChecks(9, { allowFailure: ["migracion"], spawn });
  assert.equal(allowed.status, 0);
  assert.deepEqual(allowed.ignored, ["migracion"]);

  const blocked = runChecks(9, { allowFailure: [], spawn });
  assert.equal(blocked.status, 1);
});

test("appJwt firma RS256 con el App ID y una caducidad corta", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ type: "pkcs1", format: "pem" });
  const now = Date.UTC(2026, 9, 28, 12, 0, 0);
  const token = appJwt({ appId: 5512872, privateKey: pem, now });
  const [header, payload, signature] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), {
    alg: "RS256",
    typ: "JWT",
  });
  const claims = JSON.parse(Buffer.from(payload, "base64url"));
  assert.equal(claims.iss, "5512872");
  assert.equal(claims.iat, Math.floor(now / 1000) - 60);
  assert.equal(claims.exp, Math.floor(now / 1000) + 540);
  assert.ok(
    verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, "base64url"),
    ),
  );
});

test("installationToken pide el token de la instalación y lo cachea", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-app-"));
  const keyPath = path.join(dir, "app.pem");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  fs.writeFileSync(
    keyPath,
    privateKey.export({ type: "pkcs1", format: "pem" }),
  );
  const now = Date.now();
  const calls = [];
  const request = (url, jwt) => {
    calls.push({ url, jwt });
    return { token: "ghs_token", expiresAt: now + 60 * 60_000 };
  };
  const config = {
    appId: "5512872",
    installationId: "176284310",
    keyPath,
  };
  try {
    assert.equal(installationToken(config, { request, now }), "ghs_token");
    assert.match(
      calls[0].url,
      /\/app\/installations\/176284310\/access_tokens$/,
    );
    assert.equal(calls[0].jwt.split(".").length, 3);
    assert.equal(
      installationToken(config, { request, now: now + 60_000 }),
      "ghs_token",
    );
    assert.equal(calls.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
