import { execFileSync, spawnSync } from "node:child_process";
import { createSign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";

import { readEnv } from "./config.mjs";

export const GUARD_CONTEXT = "gh-guard";

const APP_TOKEN_MARGIN_MS = 60_000;
let appTokenCache = null;

const b64url = (value) => Buffer.from(value).toString("base64url");

/** JWT de la GitHub App (RS256, 9 minutos). Se usa solo para pedir el token de
 *  instalación; no viaja a git ni se guarda. */
export function appJwt({ appId, privateKey, now = Date.now() }) {
  if (!appId) throw new Error("Falta GITHUB_APP_ID");
  if (!privateKey) throw new Error("Falta la private key de la GitHub App");
  const iat = Math.floor(now / 1000) - 60;
  const exp = Math.floor(now / 1000) + 540;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat, exp, iss: String(appId) }));
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(privateKey)
    .toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function expandHome(file) {
  return String(file).replace(/^~(?=$|\/)/, os.homedir());
}

function appConfig(env, file) {
  const config = {
    appId: env.GITHUB_APP_ID ?? file.GITHUB_APP_ID,
    installationId:
      env.GITHUB_APP_INSTALLATION_ID ?? file.GITHUB_APP_INSTALLATION_ID,
    keyPath: env.GITHUB_APP_PRIVATE_KEY ?? file.GITHUB_APP_PRIVATE_KEY,
  };
  if (!config.appId && !config.installationId && !config.keyPath) return null;
  if (!config.appId || !config.installationId || !config.keyPath) {
    throw new Error(
      "GitHub App incompleta: define GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID y GITHUB_APP_PRIVATE_KEY",
    );
  }
  return { ...config, keyPath: expandHome(config.keyPath) };
}

function requestInstallationToken(url, jwt) {
  const result = spawnSync(
    "curl",
    [
      "-sS",
      "-X",
      "POST",
      "-H",
      "Accept: application/vnd.github+json",
      "-H",
      `Authorization: Bearer ${jwt}`,
      "-H",
      "X-GitHub-Api-Version: 2022-11-28",
      "-H",
      "User-Agent: orquestator",
      url,
    ],
    { encoding: "utf8" },
  );
  if (result.error) {
    throw new Error(`No se pudo ejecutar curl: ${result.error.message}`);
  }
  const body = String(result.stdout ?? "").trim();
  if (result.status !== 0) {
    throw new Error(
      `GitHub App no pudo obtener el token de instalación${body ? `: ${body}` : ` (curl exit ${result.status})`}`,
    );
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("GitHub App devolvió una respuesta que no es JSON");
  }
  if (!data.token) {
    throw new Error(
      `GitHub App no devolvió token${data.message ? `: ${data.message}` : ""}`,
    );
  }
  return {
    token: data.token,
    expiresAt: Date.parse(data.expires_at) || Date.now() + 50 * 60_000,
  };
}

/** Token de instalación, cacheado hasta un minuto antes de caducar. */
export function installationToken(
  { appId, installationId, keyPath },
  { request = requestInstallationToken, now = Date.now() } = {},
) {
  const cacheKey = `${appId}:${installationId}:${keyPath}`;
  if (
    appTokenCache?.key === cacheKey &&
    appTokenCache.expiresAt - APP_TOKEN_MARGIN_MS > now
  ) {
    return appTokenCache.token;
  }
  let privateKey;
  try {
    privateKey = fs.readFileSync(keyPath, "utf8");
  } catch (error) {
    throw new Error(
      `No se pudo leer la private key de GitHub App (${keyPath}): ${error.message}`,
    );
  }
  const jwt = appJwt({ appId, privateKey, now });
  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;
  const result = request(url, jwt);
  appTokenCache = {
    key: cacheKey,
    token: result.token,
    expiresAt: result.expiresAt,
  };
  return result.token;
}

/** GH_TOKEN de una App instalada si está configurada; si no, el PAT. */
export function githubToken(env = process.env) {
  const file = readEnv();
  const app = appConfig(env, file);
  if (app) return installationToken(app);
  return env.GH_TOKEN || file.GH_TOKEN || null;
}

export function ghEnv(env = process.env) {
  const token = githubToken(env);
  return token ? { ...env, GH_TOKEN: token } : env;
}

/** URL HTTPS para un remoto GitHub; null si no es GitHub. */
export function githubUrl(remote) {
  const ssh = /^git@github\.com:(.+)$/.exec(remote);
  if (ssh) return `https://github.com/${ssh[1]}`;
  if (/^https:\/\/github\.com\//.test(remote)) return remote;
  return null;
}

/** Config de git para autenticar el push/fetch por HTTPS sin sesión. */
export function gitAuthEnv(token) {
  return {
    ...process.env,
    GH_TOKEN: token,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0:
      "!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f",
  };
}

export function runGh(args) {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      env: ghEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = String(error.stderr ?? "").trim();
    throw new Error(`gh ${args.join(" ")} falló${detail ? `: ${detail}` : ""}`);
  }
}

export function statusArgs(sha, state, description) {
  return [
    "api",
    `repos/{owner}/{repo}/statuses/${sha}`,
    "-f",
    `state=${state}`,
    "-f",
    "context=gh-guard",
    "-f",
    `description=${description}`,
    "-f",
    "target_url=",
  ];
}

export function createArgs(title, bodyFile, branch) {
  return [
    "pr",
    "create",
    "--title",
    title,
    "--body-file",
    bodyFile,
    "--base",
    "main",
    "--head",
    branch,
  ];
}

export function editArgs(branch, bodyFile) {
  return ["pr", "edit", branch, "--body-file", bodyFile];
}

export function viewArgs(branch) {
  return [
    "pr",
    "view",
    branch,
    "--json",
    "number,url,headRefOid,state,mergeable,statusCheckRollup",
  ];
}

export function commentArgs(pr, bodyFile) {
  return ["pr", "comment", String(pr), "--body-file", bodyFile];
}

export function commentBodyArgs(pr, body) {
  return ["pr", "comment", String(pr), "--body", body];
}

export function reviewArgs(pr, bodyFile) {
  return ["pr", "review", String(pr), "--comment", "--body-file", bodyFile];
}

export function checksArgs(pr) {
  return ["pr", "checks", String(pr), "--watch", "--interval", "10"];
}

/** Espera a que la CI de la PR termine. Devuelve {status, stdout, stderr}. */
export function runChecks(pr, { allowFailure = [], spawn = spawnSync } = {}) {
  let result;
  // Justo tras abrir la PR, `gh` puede decir que aún no hay checks; se reintenta.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    result = spawn("gh", checksArgs(pr), {
      encoding: "utf8",
      env: ghEnv(),
      timeout: 30 * 60 * 1000,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (!/no checks reported/i.test(output)) break;
    execFileSync("sleep", ["10"]);
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0 && allowFailure.length) {
    const rows = output
      .split("\n")
      .map((line) => line.split("\t"))
      .filter(([name, state]) => name && state);
    const failed = rows
      .filter(([, state]) =>
        ["fail", "failure", "cancelled", "timed_out"].includes(state),
      )
      .map(([name]) => name);
    const pending = rows.some(([, state]) => state === "pending");
    if (
      failed.length &&
      !pending &&
      failed.every((name) => allowFailure.includes(name))
    ) {
      return {
        status: 0,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        ignored: failed,
      };
    }
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
