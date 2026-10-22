import fs from "node:fs";

import { releaseMigration } from "./migrations.mjs";
import { dirFor, home, load } from "./state.mjs";

export const FRONT = "https://esencial.nutrirutina.workers.dev";
export const API = "https://esencial-api.nutrirutina.workers.dev";

/** Las dos comprobaciones fiables de DEPLOY.md §7 (sin identidad). */
export async function postDeployChecks(fetchImpl = fetch) {
  const probes = [
    {
      name: "frontal",
      url: `${FRONT}/plan-recetas`,
      ok: (r) => r.status === 200,
    },
    {
      name: "api",
      url: `${API}/api/health`,
      ok: async (r) => r.status === 200 && (await r.json()).ok === true,
    },
  ];
  const results = [];
  for (const probe of probes) {
    try {
      const response = await fetchImpl(probe.url, { redirect: "manual" });
      results.push({
        name: probe.name,
        status: response.status,
        ok: await probe.ok(response),
      });
    } catch (error) {
      results.push({ name: probe.name, ok: false, error: error.message });
    }
  }
  return results;
}

export async function clean(
  key,
  {
    base = home(),
    dryRun,
    force,
    out = () => {},
    fetchImpl = fetch,
    checks = true,
  } = {},
) {
  const state = load(key, base);
  if (!state) throw new Error(`La tarea ${key} no existe`);
  if (state.state !== "Done" && !force) {
    throw new Error(
      `${key} está en ${state.state}; clean solo tras el merge (o usa --force)`,
    );
  }
  if (dryRun) {
    out(`[dry-run] borraría ${dirFor(key, base)} y liberaría la migración`);
    return { dryRun: true };
  }
  releaseMigration({ base, key });
  fs.rmSync(dirFor(key, base), { recursive: true, force: true });

  const results = checks ? await postDeployChecks(fetchImpl) : [];
  for (const result of results) {
    out(
      `${result.ok ? "OK" : "FALLA"} ${result.name}${result.status ? ` (${result.status})` : ""}${
        result.error ? ` ${result.error}` : ""
      }`,
    );
  }
  if (results.some((result) => !result.ok)) {
    out(
      "Deploy roto: npx wrangler rollback (frontal) o npx wrangler rollback -c api/wrangler.toml (API).",
    );
  }
  return { removed: true, results };
}
