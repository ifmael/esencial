import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { clientCredentialsToken, linearKey, readEnv } from "../lib/config.mjs";

let dir;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test("readEnv lee claves, export y comillas; ignora comentarios", () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-env-"));
  const file = path.join(dir, "env");
  fs.writeFileSync(
    file,
    '# comentario\nexport LINEAR_API_KEY="lin_api_1"\nNAN_API_KEY=abc\nVACIA=\n',
  );
  assert.deepEqual(readEnv(file), {
    LINEAR_API_KEY: "lin_api_1",
    NAN_API_KEY: "abc",
    VACIA: "",
  });
});

test("readEnv sin fichero devuelve vacío", () => {
  assert.deepEqual(readEnv("/no/existe/env"), {});
});

test("linearKey prefiere el entorno y falla con mensaje claro si no hay", () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-env-"));
  const file = path.join(dir, "env");
  fs.writeFileSync(file, "LINEAR_API_KEY=from_file\n");
  assert.equal(linearKey({ LINEAR_API_KEY: "from_env" }, file), "from_env");
  assert.equal(linearKey({}, file), "from_file");
  assert.throws(() => linearKey({}, "/no/existe"), /LINEAR_API_KEY/);
});

test("linearKey usa client credentials y devuelve un Bearer", () => {
  assert.equal(
    linearKey(
      { LINEAR_CLIENT_ID: "id", LINEAR_CLIENT_SECRET: "secret" },
      "/no/existe",
      () => "token",
    ),
    "Bearer token",
  );
  assert.throws(
    () => linearKey({ LINEAR_CLIENT_ID: "id" }, "/no/existe"),
    /LINEAR_CLIENT_SECRET/,
  );
});

test("clientCredentialsToken cachea el token hasta caducar", () => {
  let calls = 0;
  const request = () => {
    calls += 1;
    return { token: "app-token", expiresAt: 1_000_000 };
  };
  const config = { clientId: "id", clientSecret: "secret" };
  assert.equal(
    clientCredentialsToken(config, { request, now: 0 }),
    "app-token",
  );
  assert.equal(
    clientCredentialsToken(config, { request, now: 900_000 }),
    "app-token",
  );
  assert.equal(calls, 1);
});
