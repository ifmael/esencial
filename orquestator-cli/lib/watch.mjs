import fs from "node:fs";
import path from "node:path";

import { clean } from "./clean.mjs";
import { linearKey, linearTeam } from "./config.mjs";
import { dockerProblem } from "./container.mjs";
import { runGh, viewArgs } from "./github.mjs";
import {
  getIssue,
  readyIssues,
  setState,
  specReviewIssues,
  updateDescription,
} from "./linear.mjs";
import { runFlow } from "./run.mjs";
import { specReview } from "./spec.mjs";
import {
  readSpecMarker,
  specDefinition,
  specInputHash,
  specReady,
  writeSpecMarker,
} from "./spec-state.mjs";
import { dirFor, home, list, load, save, transition } from "./state.mjs";

const LOCK_STALE_MS = 24 * 60 * 60 * 1000;

export const AGREEMENT = "<!-- orquestator-cli:acordado -->";

/** El humano acepta la spec añadiendo este bloque a la descripción. */
export function specAgreed(description) {
  return String(description ?? "").includes(AGREEMENT);
}

function withoutAgreement(description) {
  return String(description ?? "")
    .replaceAll(AGREEMENT, "")
    .trimEnd();
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/** Cerrojo con el pid dentro; un proceso muerto no bloquea. */
function lock(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  for (;;) {
    try {
      fs.writeFileSync(file, String(process.pid), {
        flag: "wx",
        mode: 0o600,
      });
      return () => fs.rmSync(file, { force: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const pid = Number(fs.readFileSync(file, "utf8").trim());
      const old = Date.now() - fs.statSync(file).mtimeMs > LOCK_STALE_MS;
      if (alive(pid) && !old) return null;
      fs.rmSync(file, { force: true });
    }
  }
}

export function watchLock(base = home()) {
  return lock(base, "watch.lock");
}

function taskLock(key, base) {
  return lock(dirFor(key, base), "run.lock");
}

/** Motivo si Docker no está disponible; null si responde. */
function dockerUnavailable() {
  return dockerProblem();
}

function sleepSeconds(seconds, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, seconds * 1000);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Cola de Linear: arranca las Ready y reanuda las In Progress. No reintenta
 * una tarea parada hasta que su estado cambie (`fix` o `resume`).
 */
export async function watch({
  base = home(),
  main = process.cwd(),
  apiKey = linearKey(),
  team = linearTeam(),
  maxParallel = 1,
  intervalSecs = 60,
  once = false,
  dryRun = false,
  out = () => {},
  fetchImpl = fetch,
  ghRun = runGh,
  run = runFlow,
  cleanTask = clean,
  listStates = list,
  loadState = load,
  saveState = save,
  ready = readyIssues,
  specs = specReviewIssues,
  issue = getIssue,
  move = setState,
  edit = updateDescription,
  review = specReview,
  dockerCheck = dockerUnavailable,
  sleep = sleepSeconds,
  signal,
} = {}) {
  if (!Number.isInteger(maxParallel) || maxParallel < 1) {
    throw new Error("--max-parallel debe ser un entero ≥ 1");
  }
  if (!Number.isFinite(intervalSecs) || intervalSecs <= 0) {
    throw new Error("--interval debe ser un número de segundos > 0");
  }
  if (dryRun) once = true;
  if (!dryRun) {
    const problem = dockerCheck();
    if (problem) {
      throw new Error(
        typeof problem === "string"
          ? problem
          : "Docker no es accesible desde watch",
      );
    }
  }

  const releaseWatch = dryRun ? () => {} : watchLock(base);
  if (!releaseWatch) throw new Error(`Ya hay un watch abierto en ${base}`);

  const running = new Map();
  const specRunning = new Map();
  const failures = new Map();
  const cleaning = new Set();

  async function close(key, state) {
    if (dryRun) {
      out(`[dry-run] ${key}: PR mergeada; la cerraría y limpiaría`);
      return;
    }
    out(`${key}: PR #${state.pr.number} mergeada; cierro la tarea`);
    try {
      const found = await issue(apiKey, key, fetchImpl);
      await move(apiKey, found, "Done", fetchImpl);
    } catch (error) {
      out(`${key}: no pude cerrar en Linear (${error.message})`);
      return;
    }
    try {
      saveState(key, transition(state, "Done"), base);
    } catch (error) {
      out(`${key}: ${error.message}`);
      return;
    }
    await cleanKey(key);
  }

  async function cleanKey(key) {
    if (dryRun) {
      out(`[dry-run] ${key}: limpiaría la tarea`);
      return;
    }
    if (cleaning.has(key) || running.has(key)) return;
    cleaning.add(key);
    try {
      await cleanTask(key, {
        base,
        main,
        out: (text) => out(`${key}: ${text}`),
      });
    } catch (error) {
      out(`${key}: clean falló (${error.message})`);
    } finally {
      cleaning.delete(key);
    }
  }

  function dispatch(key, updatedAt) {
    if (dryRun) {
      run(key, {
        base,
        main,
        dryRun: true,
        out: (text) => out(`${key}: ${text}`),
      });
      return;
    }
    const release = taskLock(key, base);
    if (!release) {
      out(`${key}: otro run lo tiene abierto`);
      return;
    }
    const promise = Promise.resolve()
      .then(() =>
        run(key, {
          base,
          main,
          out: (text) => out(`${key}: ${text}`),
        }),
      )
      .then((result) => {
        if (result?.ok || result?.dryRun) return;
        const current = loadState(key, base);
        failures.set(key, current?.updatedAt ?? updatedAt ?? "?");
        const detail = result?.error ?? result?.hint;
        out(
          `${key}: parado en ${result?.stop ?? "?"}${detail ? ` — ${detail}` : ""}`,
        );
      })
      .catch((error) => {
        const current = loadState(key, base);
        failures.set(key, current?.updatedAt ?? updatedAt ?? "?");
        out(`${key}: ${error.message}`);
      })
      .finally(() => {
        release();
        running.delete(key);
      });
    running.set(key, promise);
  }

  async function acceptSpecs() {
    if (signal?.aborted) return;
    let queue;
    try {
      queue = (await specs(apiKey, team, fetchImpl)) ?? [];
    } catch (error) {
      out(`Linear: no pude leer Spec review (${error.message})`);
      return;
    }
    for (const found of queue) {
      const key = found?.identifier;
      if (!key || !specAgreed(found.description)) continue;
      if (dryRun) {
        out(`[dry-run] ${key}: spec acordada; la movería a Ready`);
        continue;
      }
      try {
        await move(apiKey, found, "Ready", fetchImpl);
      } catch (error) {
        out(`${key}: no pude mover la spec a Ready (${error.message})`);
        continue;
      }
      out(`${key}: spec acordada; a Ready`);
      const rest = withoutAgreement(found.description);
      if (rest === found.description) continue;
      try {
        await edit(apiKey, found, rest, fetchImpl);
      } catch (error) {
        out(`${key}: no pude borrar el bloque de acuerdo (${error.message})`);
      }
    }
  }

  /** Lanza el revisor al entrar en Spec review; repite solo si cambia el texto. */
  async function autoSpecs() {
    if (signal?.aborted) return;
    let queue;
    try {
      queue = (await specs(apiKey, team, fetchImpl)) ?? [];
    } catch (error) {
      out(`Linear: no pude leer Spec review (${error.message})`);
      return;
    }
    for (const found of queue) {
      const key = found?.identifier;
      if (!key || specAgreed(found.description)) continue;
      if (specRunning.has(key)) continue;
      if (specRunning.size >= maxParallel) break;
      const hash = specInputHash(found);
      const marker = readSpecMarker(base, key);
      if (marker?.hash === hash) {
        if (marker.status === "ready" && !dryRun) {
          try {
            let latest = found;
            if (marker.definition && marker.definition !== found.description) {
              await edit(apiKey, found, marker.definition, fetchImpl);
              latest = { ...found, description: marker.definition };
              writeSpecMarker(base, key, {
                ...marker,
                hash: specInputHash(latest),
              });
            }
            await move(apiKey, latest, "Ready", fetchImpl);
            out(`${key}: spec revisada; a Ready`);
          } catch (error) {
            out(`${key}: no pude cerrar la spec (${error.message})`);
          }
        }
        continue;
      }
      if (dryRun) {
        out(`[dry-run] ${key}: lanzaría spec-review`);
        continue;
      }
      const promise = Promise.resolve()
        .then(() =>
          review(key, {
            apiKey,
            base,
            main,
            out: (text) => out(`${key}: ${text}`),
          }),
        )
        .then(async (result) => {
          const fresh = await issue(apiKey, key, fetchImpl);
          if (fresh.state?.name !== "Spec review") return;
          if (specInputHash(fresh) !== hash) {
            out(`${key}: la spec cambió mientras se revisaba; repito`);
            return;
          }
          const ready = specReady(result?.artifact);
          const definition = specDefinition(result?.artifact);
          if (!ready) {
            writeSpecMarker(base, key, {
              hash,
              status: "questions",
              definition,
              at: new Date().toISOString(),
            });
            out(`${key}: spec-review publicó preguntas`);
            return;
          }
          let latest = fresh;
          try {
            if (definition && definition !== fresh.description) {
              await edit(apiKey, fresh, definition, fetchImpl);
              latest = { ...fresh, description: definition };
            }
            writeSpecMarker(base, key, {
              hash: specInputHash(latest),
              status: "ready",
              definition,
              at: new Date().toISOString(),
            });
            await move(apiKey, latest, "Ready", fetchImpl);
            out(`${key}: spec revisada; a Ready`);
          } catch (error) {
            out(`${key}: no pude cerrar la spec (${error.message})`);
          }
        })
        .catch((error) => {
          out(`${key}: spec-review falló (${error.message})`);
        })
        .finally(() => specRunning.delete(key));
      specRunning.set(key, promise);
    }
  }

  async function tick() {
    let states;
    try {
      states = listStates(base);
    } catch (error) {
      out(`estado: ${error.message}`);
      return;
    }

    for (const state of states) {
      if (state.state === "Done") {
        await cleanKey(state.key);
        continue;
      }
      if (state.state !== "In validation" || !state.pr?.number) continue;
      let pr;
      try {
        pr = JSON.parse(ghRun(viewArgs(String(state.pr.number))));
      } catch (error) {
        out(`${state.key}: no pude leer la PR (${error.message})`);
        continue;
      }
      if (pr.state === "MERGED") await close(state.key, state);
    }

    if (running.size < maxParallel && !signal?.aborted) {
      for (const state of listStates(base)) {
        if (running.size >= maxParallel || signal?.aborted) break;
        if (state.state !== "In Progress" || running.has(state.key)) continue;
        if (failures.get(state.key) === state.updatedAt) continue;
        dispatch(state.key, state.updatedAt);
      }
    }

    await autoSpecs();
    await acceptSpecs();

    if (running.size >= maxParallel || signal?.aborted) return;
    let queue;
    try {
      queue = (await ready(apiKey, team, fetchImpl)) ?? [];
    } catch (error) {
      out(`Linear: no pude leer Ready (${error.message})`);
      return;
    }
    const known = new Set(listStates(base).map((state) => state.key));
    for (const issue of queue) {
      if (running.size >= maxParallel || signal?.aborted) break;
      const key = issue.identifier;
      if (!key || known.has(key) || running.has(key) || failures.has(key))
        continue;
      known.add(key);
      dispatch(key, null);
    }
  }

  try {
    do {
      await tick();
      if (once || signal?.aborted) break;
      await sleep(intervalSecs, signal);
    } while (!signal?.aborted);
    await Promise.allSettled([...running.values(), ...specRunning.values()]);
    return { ok: true, once };
  } finally {
    releaseWatch();
  }
}
