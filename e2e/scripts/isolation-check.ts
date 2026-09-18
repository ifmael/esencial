// Guardia de aislamiento: `pnpm e2e` NO puede tocar la base de desarrollo.
//
// Cuenta las filas de cada tabla D1 y los objetos R2 de `.wrangler/state` antes
// y después de la suite, y sale con 1 si algún conteo cambió. R2 entra en el
// conteo porque los specs de recetas suben una foto al bucket PHOTOS, así que la
// fuga no es solo relacional.
//
// No navegues la app de desarrollo ni la apuntes mientras corre: esas
// escrituras también mueven los conteos y provocarían un falso positivo.
//
// Uso: pnpm e2e:check [-- <filtro de Playwright>]
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const DEV_STATE = resolve(REPO_ROOT, ".wrangler/state/v3");
const D1_DIR = resolve(DEV_STATE, "d1/miniflare-D1DatabaseObject");
const R2_DIR = resolve(DEV_STATE, "r2/miniflare-R2BucketObject");

type Counts = Record<string, number>;

/** Sqlites del miniflare local, sin los de metadatos. */
function sqliteFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite")
      .map((f) => resolve(dir, f));
  } catch {
    return []; // primera corrida: el directorio todavía no existe
  }
}

function count(db: DatabaseSync, sql: string): number {
  const row = db.prepare(sql).get() as unknown as { n?: number } | undefined;
  return Number(row?.n ?? 0);
}

/** Filas por tabla (D1) y objetos (R2) de todo el estado de desarrollo. */
function snapshot(): Counts {
  const counts: Counts = {};
  for (const file of sqliteFiles(D1_DIR)) {
    const db = new DatabaseSync(file, { readOnly: true });
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table'" +
          " AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
      )
      .all() as unknown as { name: string }[];
    for (const { name } of tables) {
      counts[`d1/${basename(file)}/${name}`] = count(
        db,
        `SELECT count(*) AS n FROM "${name}"`,
      );
    }
    db.close();
  }
  for (const file of sqliteFiles(R2_DIR)) {
    const db = new DatabaseSync(file, { readOnly: true });
    const hasTable = db
      .prepare(
        "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = '_mf_objects'",
      )
      .get() as unknown as { n: number };
    if (Number(hasTable.n) > 0) {
      counts["r2/_mf_objects"] =
        (counts["r2/_mf_objects"] ?? 0) +
        count(db, "SELECT count(*) AS n FROM _mf_objects");
    }
    db.close();
  }
  return counts;
}

function differences(before: Counts, after: Counts): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs: string[] = [];
  for (const key of keys) {
    const was = before[key] ?? 0;
    const now = after[key] ?? 0;
    if (was !== now) diffs.push(`${key}: ${was} -> ${now}`);
  }
  return diffs;
}

function runSuite(extra: string[]): number {
  // stdio "inherit": la salida de Playwright va directa al terminal.
  return (
    spawnSync("pnpm", ["e2e", ...extra], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    }).status ?? 1
  );
}

const before = snapshot();
const suite = runSuite(process.argv.slice(2));
const diffs = differences(before, snapshot());

console.log(`\n[isolation-check] suite exit=${suite}`);
if (diffs.length === 0) {
  console.log("[isolation-check] OK — .wrangler/state intacto");
  process.exit(suite);
}
console.error(
  `[isolation-check] FUGA — ${diffs.length} conteo(s) cambiados en .wrangler/state:`,
);
for (const diff of diffs) console.error(`  ${diff}`);
process.exit(1);
