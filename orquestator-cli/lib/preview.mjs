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
import { runWrangler } from "./wrangler.mjs";

export const PREVIEW_DB = "esencial-preview";
export const PREVIEW_BUCKET = "esencial-photos-preview";
export const SUBDOMAIN = "nutrirutina";
// Preview: `ctx.access` no existe en las Preview URLs de Workers (issue
// cloudflare/cloudflare-docs#33810), así que la API valida el JWT de Access.
// Si se recrea la app `Esencial previews`, actualizar el aud (o en el env).
export const ACCESS_TEAM_DOMAIN = "https://ifmael.cloudflareaccess.com";
export const PREVIEW_POLICY_AUD =
  "f9d4a592a123777a910776eb63a7220696bc4d680f9ce433ba9d1a50042a3832";
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
    "> **Acceso:** abre primero la API e inicia sesión; la cookie de Access es por",
    "> host. Después abre la web. Si abres la web primero, las llamadas a la API",
    "> parecen un fallo de base de datos.",
    "",
    `- API (abrir primero): ${urls.api}`,
    `- Web: ${urls.web}`,
    "<!-- /preview -->",
  ].join("\n");
  const existing = /<!-- preview -->[\s\S]*?<!-- \/preview -->/;
  if (existing.test(body)) return body.replace(existing, block);
  return `${body.trimEnd()}\n\n${block}\n`;
}

export function previewUrlOf(output) {
  // `--json` deja el JSON detrás del progreso («Building list of assets…»).
  const start = output.indexOf("{");
  let data = null;
  if (start !== -1) {
    try {
      data = JSON.parse(output.slice(start));
    } catch {
      data = null;
    }
  }
  if (!data) {
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

const defaultWrangler = runWrangler;

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

async function expectPreflight(api, web, { fetchImpl }) {
  const response = await fetchImpl(`${api}/api/recipes`, {
    method: "OPTIONS",
    headers: {
      Origin: web,
      "Access-Control-Request-Method": "GET",
    },
  });
  if (response.status === 403) {
    throw new Error(
      `Access bloquea el preflight CORS de ${api}: activa «Bypass OPTIONS requests» (options_preflight_bypass) en la app de Access de previews`,
    );
  }
  const allow = response.headers?.get?.("access-control-allow-origin");
  if (response.status !== 204 && response.status !== 200) {
    throw new Error(
      `El preflight CORS de ${api} devolvió HTTP ${response.status} (se espera 204)`,
    );
  }
  if (allow !== web) {
    throw new Error(
      `El preflight CORS de ${api} no autoriza ${web} (Access-Control-Allow-Origin: ${allow ?? "falta"})`,
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

  const deploy = (config, worker, vars) => {
    const args = [
      "preview",
      "-c",
      config,
      "--name",
      name,
      "--worker-name",
      worker,
    ];
    for (const [key, value] of Object.entries(vars)) {
      args.push("--var", `${key}:${value}`);
    }
    args.push("--json");
    return previewUrlOf(wrangler(args, { cwd: repo, env, main }));
  };

  const team = env.ACCESS_TEAM_DOMAIN ?? ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_POLICY_AUD ?? PREVIEW_POLICY_AUD;
  const api = deploy("api/wrangler.toml", "esencial-api", {
    WEB_ORIGIN: urls.web,
    TEAM_DOMAIN: team,
    POLICY_AUD: aud,
  });
  const web = deploy("wrangler.toml", "esencial", { API_ORIGIN: urls.api });
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
  await expectPreflight(api, web, { fetchImpl });

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
