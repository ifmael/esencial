import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { readArtifact, writeArtifact } from "../lib/artifacts.mjs";
import { ACCESS_LOGIN } from "../lib/clean.mjs";
import {
  deletePreview,
  PREVIEW_BUCKET,
  PREVIEW_DB,
  previewName,
  previewTask,
  previewUrlOf,
  previewUrls,
  withPreviewBlock,
} from "../lib/preview.mjs";
import { createState, load, repoDir, save, transition } from "../lib/state.mjs";

const KEY = "ESN-7";
const NAME = "esn-7";

let dir;
let base;
let main;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestator-preview-"));
  base = path.join(dir, "home");
  main = path.join(dir, "main");
  fs.mkdirSync(repoDir(KEY, base), { recursive: true });
  fs.mkdirSync(main, { recursive: true });
  save(
    KEY,
    transition(
      {
        ...createState(KEY),
        branch: `${KEY}-algo`,
        issueTitle: "Algo",
        pr: { number: 9, url: "u" },
      },
      "In Progress",
    ),
    base,
  );
  writeArtifact(KEY, "pr-body.md", "Fixes ESN-7\n", base);
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function accessOk() {
  return async (url, options = {}) => {
    if (options.method === "OPTIONS") {
      return {
        status: 204,
        headers: {
          get: (name) =>
            name === "access-control-allow-origin"
              ? previewUrls(NAME).web
              : null,
        },
      };
    }
    return {
      status: 302,
      headers: { get: () => `${ACCESS_LOGIN}?redirect_uri=x` },
    };
  };
}

function happyWrangler(calls) {
  return (args) => {
    calls.push(args);
    if (args[0] === "d1") return "";
    if (args[0] === "preview" && args.includes("--json")) {
      const worker = args[args.indexOf("--worker-name") + 1];
      return JSON.stringify({
        preview: {
          urls: [previewUrls(NAME)[worker === "esencial-api" ? "api" : "web"]],
        },
      });
    }
    return "";
  };
}

function options(extra = {}) {
  return {
    base,
    main,
    env: { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a" },
    fetchImpl: accessOk(),
    sleep: async () => {},
    ghRun: () => "",
    image: "img",
    ...extra,
  };
}

test("previewUrlOf lee el JSON aunque wrangler imprima progreso antes", () => {
  const output = [
    "🌀 Building list of assets...",
    "✨ Read 11 files",
    JSON.stringify({
      deployment: {
        urls: ["https://3d47615a-esencial.nutrirutina.workers.dev"],
      },
      preview: { urls: ["https://esn-7-esencial.nutrirutina.workers.dev"] },
    }),
  ].join("\n");
  assert.equal(
    previewUrlOf(output),
    "https://esn-7-esencial.nutrirutina.workers.dev",
  );
});

test("previewName y previewUrls son predecibles", () => {
  assert.equal(previewName(KEY), NAME);
  assert.deepEqual(previewUrls(NAME), {
    web: "https://esn-7-esencial.nutrirutina.workers.dev",
    api: "https://esn-7-esencial-api.nutrirutina.workers.dev",
  });
});

test("preview construye, migra, despliega los dos Workers y guarda el estado", async () => {
  const runner = [];
  const wrangler = [];
  const gh = [];
  const out = [];
  const result = await previewTask(
    KEY,
    options({
      runner: (opts) => {
        runner.push(opts);
        return { status: 0 };
      },
      wrangler: happyWrangler(wrangler),
      ghRun: (args) => {
        gh.push(args);
        return "";
      },
      out: (text) => out.push(text),
    }),
  );

  const urls = previewUrls(NAME);
  assert.equal(result.web, urls.web);
  assert.equal(result.api, urls.api);

  assert.equal(runner.length, 1);
  assert.equal(runner[0].phase, "preview");
  assert.match(runner[0].command, new RegExp(`VITE_API_URL=${urls.api}`));

  const migration = wrangler.find((args) => args[0] === "d1");
  assert.deepEqual(migration.slice(0, 3), ["d1", "migrations", "apply"]);
  assert.ok(migration.includes("--remote"));
  assert.ok(migration.includes(PREVIEW_DB));

  const previews = wrangler.filter(
    (args) => args[0] === "preview" && args[1] !== "delete",
  );
  assert.equal(previews.length, 2);
  const api = previews.find((args) => args.includes("esencial-api"));
  const web = previews.find((args) => args.includes("esencial"));
  assert.ok(api.includes(`WEB_ORIGIN:${urls.web}`));
  assert.ok(api.includes("TEAM_DOMAIN:https://ifmael.cloudflareaccess.com"));
  assert.ok(api.some((arg) => arg.startsWith("POLICY_AUD:")));
  assert.ok(web.includes(`API_ORIGIN:${urls.api}`));

  const state = load(KEY, base);
  assert.equal(state.preview.name, NAME);
  assert.equal(state.preview.web, urls.web);
  assert.equal(state.preview.api, urls.api);
  assert.equal(state.preview.database, PREVIEW_DB);
  assert.equal(state.preview.bucket, PREVIEW_BUCKET);
  assert.match(readArtifact(KEY, "pr-body.md", base), /## Preview/);
  assert.equal(gh.length, 1);
  assert.equal(gh[0][1], "edit");
});

test("un preview público sin Access falla y no guarda el estado", async () => {
  const publicFetch = async () => ({ status: 200, headers: { get: () => "" } });
  await assert.rejects(
    () =>
      previewTask(
        KEY,
        options({
          runner: () => ({ status: 0 }),
          wrangler: happyWrangler([]),
          fetchImpl: publicFetch,
        }),
      ),
    /Access/,
  );
  assert.equal(load(KEY, base).preview, undefined);
});

test("un preflight bloqueado por Access se detecta antes de guardar", async () => {
  const preflightBlocked = async (url, options = {}) =>
    options.method === "OPTIONS"
      ? { status: 403, headers: { get: () => null } }
      : {
          status: 302,
          headers: { get: () => `${ACCESS_LOGIN}?redirect_uri=x` },
        };
  await assert.rejects(
    () =>
      previewTask(
        KEY,
        options({
          runner: () => ({ status: 0 }),
          wrangler: happyWrangler([]),
          fetchImpl: preflightBlocked,
        }),
      ),
    /preflight/,
  );
  assert.equal(load(KEY, base).preview, undefined);
});

test("sin credenciales de Cloudflare no se construye ni se despliega", async () => {
  let called = 0;
  await assert.rejects(
    () =>
      previewTask(
        KEY,
        options({
          env: {},
          runner: () => {
            called += 1;
          },
          wrangler: () => {
            called += 1;
          },
        }),
      ),
    /CLOUDFLARE_API_TOKEN/,
  );
  assert.equal(called, 0);
});

test("--dry-run no ejecuta nada", async () => {
  let called = 0;
  const result = await previewTask(
    KEY,
    options({
      dryRun: true,
      runner: () => {
        called += 1;
      },
      wrangler: () => {
        called += 1;
      },
    }),
  );
  assert.equal(result.dryRun, true);
  assert.equal(called, 0);
  assert.equal(load(KEY, base).preview, undefined);
});

test("withPreviewBlock añade el bloque una sola vez", () => {
  const urls = previewUrls(NAME);
  const once = withPreviewBlock("Fixes ESN-7\n", urls);
  assert.equal(once.match(/<!-- preview -->/g).length, 1);
  assert.match(once, /abre primero la API/i);
  const twice = withPreviewBlock(once, { web: "w2", api: "a2" });
  assert.equal(twice.match(/<!-- preview -->/g).length, 1);
  assert.match(twice, /w2/);
  assert.doesNotMatch(twice, /https:\/\/esn-7/);
});

test("deletePreview borra los dos previews y es idempotente sin preview", async () => {
  const state = load(KEY, base);
  save(
    KEY,
    {
      ...state,
      preview: { name: NAME, web: "w", api: "a" },
    },
    base,
  );
  const calls = [];
  await deletePreview(KEY, {
    base,
    wrangler: (args) => {
      calls.push(args);
      return "";
    },
  });
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every((args) => args[0] === "preview" && args[1] === "delete"),
  );
  assert.deepEqual(
    calls.map((args) => args[args.indexOf("--worker-name") + 1]).sort(),
    ["esencial", "esencial-api"],
  );

  save(KEY, { ...load(KEY, base), preview: null }, base);
  const again = [];
  await deletePreview(KEY, {
    base,
    wrangler: (args) => {
      again.push(args);
    },
  });
  assert.equal(again.length, 0);
});
