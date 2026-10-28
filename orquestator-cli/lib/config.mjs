import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function readEnv(
  file = path.join(os.homedir(), ".config", "orquestator", "env"),
) {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  const env = {};
  for (const line of text.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

export function linearTeam(env = process.env, file) {
  return env.LINEAR_TEAM ?? readEnv(file).LINEAR_TEAM ?? "ESN";
}

const TOKEN_MARGIN_MS = 60_000;
let linearTokenCache = null;

function requestClientCredentials({ clientId, clientSecret }) {
  const result = spawnSync(
    "curl",
    [
      "-sS",
      "-X",
      "POST",
      "https://api.linear.app/oauth/token",
      "-H",
      "Content-Type: application/x-www-form-urlencoded",
      "--data-urlencode",
      "grant_type=client_credentials",
      "--data-urlencode",
      "scope=read,write",
      "--data-urlencode",
      `client_id=${clientId}`,
      "--data-urlencode",
      `client_secret=${clientSecret}`,
    ],
    { encoding: "utf8" },
  );
  if (result.error) {
    throw new Error(`No se pudo ejecutar curl: ${result.error.message}`);
  }
  const body = String(result.stdout ?? "").trim();
  if (result.status !== 0) {
    throw new Error(
      `Linear no pudo obtener token de app${body ? `: ${body}` : ` (curl exit ${result.status})`}`,
    );
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("Linear devolvió una respuesta que no es JSON");
  }
  if (!data.access_token) {
    throw new Error(
      `Linear no devolvió token de app${data.error_description ? `: ${data.error_description}` : ""}`,
    );
  }
  return {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 2_592_000) * 1000,
  };
}

/** Token de app para automatización; 30 días y sin refresh. */
export function clientCredentialsToken(
  { clientId, clientSecret },
  { request = requestClientCredentials, now = Date.now() } = {},
) {
  const key = `${clientId}:${clientSecret}`;
  if (
    linearTokenCache?.key === key &&
    linearTokenCache.expiresAt - TOKEN_MARGIN_MS > now
  ) {
    return linearTokenCache.token;
  }
  const result = request({ clientId, clientSecret });
  linearTokenCache = {
    key,
    token: result.token,
    expiresAt: result.expiresAt,
  };
  return result.token;
}

export function linearKey(
  env = process.env,
  file,
  token = clientCredentialsToken,
) {
  const values = readEnv(file);
  const clientId = env.LINEAR_CLIENT_ID ?? values.LINEAR_CLIENT_ID;
  const clientSecret = env.LINEAR_CLIENT_SECRET ?? values.LINEAR_CLIENT_SECRET;
  if (clientId || clientSecret) {
    if (!clientId || !clientSecret) {
      throw new Error(
        "Linear App incompleta: define LINEAR_CLIENT_ID y LINEAR_CLIENT_SECRET",
      );
    }
    return `Bearer ${token({ clientId, clientSecret })}`;
  }
  const key = env.LINEAR_API_KEY ?? values.LINEAR_API_KEY;
  if (!key) {
    throw new Error(
      "Falta LINEAR_API_KEY (en el entorno o en ~/.config/orquestator/env)",
    );
  }
  return key;
}

/** Id del usuario humano para menciones/asignaciones cuando actúa la app. */
export function linearUserId(env = process.env, file) {
  const values = readEnv(file);
  return env.LINEAR_USER_ID ?? values.LINEAR_USER_ID ?? null;
}
