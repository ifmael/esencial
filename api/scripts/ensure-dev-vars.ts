// Dev bootstrap: crea/repara .dev.vars (raíz del repo) con un AUTH_SECRET y un
// PASSWORD_HASH para el login de desarrollo. La clave de desarrollo se lee de la
// variable de entorno ESENCIAL_DEV_PASSWORD; si no está, se genera una aleatoria
// y se imprime al arrancar (se guarda como comentario en .dev.vars, gitignored,
// para reimprimirla en siguientes arranques). Ninguna clave vive en git.
// B' (dos despliegues): wrangler resuelve `.dev.vars` junto al fichero de
// configuración, y el Worker de la API usa api/wrangler.toml, así que el mismo
// contenido se escribe también en api/.dev.vars (también gitignored).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashPassword } from "../src/auth.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const VARS = join(ROOT, ".dev.vars");
const API_VARS = join(ROOT, "api", ".dev.vars");
const ENV_PASSWORD = process.env.ESENCIAL_DEV_PASSWORD;

const b64 = (buf: Uint8Array): string => Buffer.from(buf).toString("base64");
const randomPassword = (): string =>
  b64(crypto.getRandomValues(new Uint8Array(18)));

function existingSecret(text: string | undefined): string | null {
  return text?.match(/^AUTH_SECRET="([^"]+)"/m)?.[1] ?? null;
}

/** Escribe el MISMO contenido en la raíz y junto a la config del Worker de la API. */
function writeVars(text: string): void {
  writeFileSync(VARS, text);
  writeFileSync(API_VARS, text);
}

async function makeVars(password: string, secret: string): Promise<void> {
  const digest = await hashPassword(password);
  writeVars(
    `# Auto-generado por api/scripts/ensure-dev-vars.ts (gitignored).\n` +
      `# DEV PASSWORD: ${password}\n` +
      `AUTH_SECRET="${secret}"\n` +
      `PASSWORD_HASH="${digest}"\n`,
  );
}

async function main(): Promise<void> {
  const existing = existsSync(VARS) ? readFileSync(VARS, "utf8") : null;

  if (ENV_PASSWORD) {
    // La variable de entorno manda: regenerar con la clave indicada, reutilizando
    // AUTH_SECRET si ya existe (las sesiones previas siguen siendo válidas).
    const secret =
      existingSecret(existing ?? undefined) ??
      b64(crypto.getRandomValues(new Uint8Array(32)));
    await makeVars(ENV_PASSWORD, secret);
    console.log(
      `DEV LOGIN: password "${ENV_PASSWORD}" (desde ESENCIAL_DEV_PASSWORD)`,
    );
    return;
  }

  if (existing) {
    writeVars(existing); // por si falta la copia de api/.dev.vars
    const m = existing.match(/^# DEV PASSWORD: (.+)$/m);
    console.log(
      `DEV LOGIN: password "${m ? m[1] : "(ver .dev.vars)"}" (${VARS} ya existe)`,
    );
    return;
  }

  const password = randomPassword();
  const secret = b64(crypto.getRandomValues(new Uint8Array(32)));
  await makeVars(password, secret);
  console.log(`DEV LOGIN: creado ${VARS}; password "${password}"`);
  console.log(
    `  (para una clave fija: export ESENCIAL_DEV_PASSWORD='tu clave' y reinicia pnpm dev)`,
  );
}

await main();
