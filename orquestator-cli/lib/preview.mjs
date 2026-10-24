import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { writeArtifact } from "./artifacts.mjs";
import { ACCESS_LOGIN } from "./clean.mjs";
import { readEnv } from "./config.mjs";
import { runPhase } from "./container.mjs";
import { editArgs, runGh } from "./github.mjs";
import { imageTag } from "./image.mjs";
import { home, load, repoDir, save, taskDir } from "./state.mjs";
import { mirrorPath } from "./task.mjs";

export const PREVIEW_DB = "esencial-preview";
export const PREVIEW_BUCKET = "esencial-photos-preview";
export const SUBDOMAIN = "nutrirutina";
export const ACCESS_WAITS = 12;
export const ACCESS_DELAY_MS = 5000;

export function previewName(key) {
  return key.toLowerCase();
}

export function previewUrls(name, subdomain = SUBDOMAIN) {
  return {
    web: `https://${name}-esencial.${subdomain}.workers.dev`,
    api: `https://${name}-esencial-api.${subdomain}.workers.dev`,
  };
}

export function buildCommand(apiUrl) {
  return `pnpm install --offline --frozen-lockfile --store-dir /opt/pnpm-store && VITE_API_URL=${apiUrl} pnpm --filter @esencial/web build`;
}

/** Bloque del body de la PR; idempotente para que repetir preview no lo duplique. */
export function withPreviewBlock(body, urls) {
  const block = [
    "<!-- preview -->",
    "## Preview",
    "",
    `- Web: ${urls.web}`,
    `- API: ${urls.api}`,
    "<!-- /preview -->",
  ].join("\n");
  const existing = /<!-- preview -->[\s\S]*?<!-- \/preview -->/;
  if (existing.test(body)) return body.replace(existing, block);
  return `${body.trimEnd()}\n\n${block}\n`;
}

export function previewUrlOf(output) {
  let data;
  try {
    data = JSON.parse(output);
  } catch {
    const match = /https:\/\/[^\s"]+workers\.dev/.exec(output);
    if (!match) throw new Error("Wrangler no devolvió la URL del preview");
    return match[0].replace(/\/$/, "");
  }
  const url =
    data?.preview?.urls?.[0] ??
    data?.urls?.[0] ??
    data?.preview?.url ??
    data?.url;
  if (!url) throw new Error("Wrangler no devolvió la URL del preview");
  return String(url).replace(/\/$/, "");
}

function defaultWrangler(args, { cwd, env, main }) {
  const local = path.join(main, "node_modules", ".bin", "wrangler");
  const bin = fs.existsSync(local) ? local : "wrangler";
  try {
    return execFileSync(bin, args, {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = String(error.stderr ?? "").trim();
    throw new Error(
      `wrangler ${args.join(" ")} falló${detail ? `: ${detail}` : ""}`,
    );
  }
}

function credentials(env) {
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error(
      "Falta CLOUDFLARE_API_TOKEN (en ~/.config/orquestator/env); sin él no se pueden crear previews",
    );
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error(
      "Falta CLOUDFLARE_ACCOUNT_ID (en ~/.config/orquestator/env)",
    );
  }
}

async function expectAccess(url, { fetchImpl, sleep, waits, delay, out }) {
  let last = "";
  for (let attempt = 0; attempt < waits; attempt += 1) {
    try {
      const response = await fetchImpl(url, { redirect: "manual" });
      last = `HTTP ${response.status}`;
      if (response.status === 302) {
        const location = response.headers?.get?.("location") ?? "";
        if (location.startsWith(ACCESS_LOGIN)) return;
        last = `302 hacia ${location || "otro sitio"}`;
      }
      if (response.status === 200) {
        throw new Error(
          `El preview ${url} es público: activa Cloudflare Access para las Preview URLs de los dos Workers (Zero Trust → Access → Workers) y repite`,
        );
      }
    } catch (error) {
      if (/es público/.test(error.message)) throw error;
      last = error.message;
    }
    if (attempt + 1 < waits) {
      out(`Access: ${url} aún no responde (${last}); reintento`);
      await sleep(delay);
    }
  }
  throw new Error(`Access no protege ${url} (${last})`);
}

export async function previewTask(
  key,
  {
    base = home(),
    main = process.cwd(),
    image = imageTag(),
    out = () => {},
    dryRun,
    runner = runPhase,
    wrangler = defaultWrangler,
    ghRun = runGh,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    waits = ACCESS_WAITS,
    delay = ACCESS_DELAY_MS,
    env = { ...readEnv(), ...process.env },
  } = {},
) {
  const state = load(key, base);
  if (!state) throw new Error(`La tarea ${key} no existe`);
  const repo = repoDir(key, base);
  if (!fs.existsSync(repo)) throw new Error(`Falta el clon: ${repo}`);

  const name = previewName(key);
  const urls = previewUrls(name, env.WORKERS_SUBDOMAIN ?? SUBDOMAIN);
  if (dryRun) {
    out(`[dry-run] build (VITE_API_URL=${urls.api}) y previews ${name}`);
    out(`[dry-run] web: ${urls.web}`);
    out(`[dry-run] api: ${urls.api}`);
    return { dryRun: true, name, ...urls };
  }
  credentials(env);

  const task = taskDir(key, base);
  const phase = {
    phase: "preview",
    image,
    repo,
    task,
    upstream: mirrorPath(base),
    command: buildCommand(urls.api),
    out,
  };
  const built = runner(phase);
  if (built && built.status !== 0) {
    throw new Error(`La build del preview falló (exit ${built.status})`);
  }

  wrangler(
    [
      "d1",
      "migrations",
      "apply",
      PREVIEW_DB,
      "--env",
      "preview",
      "--remote",
      "-c",
      "api/wrangler.toml",
    ],
    { cwd: repo, env, main },
  );

  const deploy = (config, worker, variable) => {
    const output = wrangler(
      [
        "preview",
        "-c",
        config,
        "--name",
        name,
        "--worker-name",
        worker,
        "--var",
        `${variable}:${variable === "API_ORIGIN" ? urls.api : urls.web}`,
        "--json",
      ],
      { cwd: repo, env, main },
    );
    return previewUrlOf(output);
  };

  const api = deploy("api/wrangler.toml", "esencial-api", "WEB_ORIGIN");
  const web = deploy("wrangler.toml", "esencial", "API_ORIGIN");
  if (api !== urls.api || web !== urls.web) {
    throw new Error(
      `Las URLs del preview no son las esperadas: ${web} / ${api} (esperadas ${urls.web} / ${urls.api})`,
    );
  }

  await expectAccess(web, { fetchImpl, sleep, waits, delay, out });
  await expectAccess(`${api}/api/health`, {
    fetchImpl,
    sleep,
    waits,
    delay,
    out,
  });

  const bodyFile = path.join(task, "pr-body.md");
  const body = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, "utf8") : "";
  writeArtifact(key, "pr-body.md", withPreviewBlock(body, urls), base);
  save(
    key,
    {
      ...load(key, base),
      preview: {
        name,
        web,
        api,
        database: PREVIEW_DB,
        bucket: PREVIEW_BUCKET,
        createdAt: new Date().toISOString(),
      },
    },
    base,
  );
  if (state.pr?.number) {
    ghRun(editArgs(String(state.pr.number), path.join(task, "pr-body.md")));
  }

  out(`Preview web: ${web}`);
  out(`Preview API: ${api}`);
  return { name, web, api };
}

export async function deletePreview(
  key,
  {
    base = home(),
    main = process.cwd(),
    out = () => {},
    dryRun,
    wrangler = defaultWrangler,
    env = { ...readEnv(), ...process.env },
  } = {},
) {
  const state = load(key, base);
  if (!state?.preview) return { deleted: false };
  const { name } = state.preview;
  if (dryRun) {
    out(`[dry-run] borraría los previews ${name}`);
    return { dryRun: true };
  }
  const repo = repoDir(key, base);
  const cwd = fs.existsSync(repo) ? repo : main;
  for (const worker of ["esencial", "esencial-api"]) {
    try {
      wrangler(
        [
          "preview",
          "delete",
          "--name",
          name,
          "--worker-name",
          worker,
          "--skip-confirmation",
        ],
        { cwd, env, main },
      );
      out(`Preview ${worker} borrado`);
    } catch (error) {
      // Ya no existe: borrar dos veces no es un fallo.
      if (!/not found|does not exist|no preview/i.test(error.message)) {
        throw error;
      }
      out(`Preview ${worker} ya no existía`);
    }
  }
  return { deleted: true };
}
