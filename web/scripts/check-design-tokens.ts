// Guardarraíl del sistema de diseño (AGENTS.md § "Sistema de diseño").
//
// Una clase arbitraria de Tailwind que inventa un valor —`rounded-[7px]`,
// `text-[10px]`— se salta la escala de `globals.css`, y por ahí es por donde un
// diseño se descompone con el tiempo. Este script las busca en `web/src` y falla
// si encuentra alguna; corre dentro de `pnpm lint`.
//
// Se aceptan los valores derivados (`var()`, `calc()`, `env()`, `min()`,
// `clamp()`): no inventan una escala, la consumen o la calculan.
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Familias que tienen token propio en `globals.css`. El orden importa: la
 * alternancia prueba de más largo a más corto (`gap-x` antes que `gap`). */
const FAMILIES = [
  "rounded",
  "text",
  "duration",
  "ease",
  "shadow",
  "gap-x",
  "gap-y",
  "gap",
  "px",
  "py",
  "pt",
  "pb",
  "pl",
  "pr",
  "p",
  "mx",
  "my",
  "mt",
  "mb",
  "ml",
  "mr",
  "m",
];

const ARBITRARY = new RegExp(
  `\\b(?:${FAMILIES.join("|")})-\\[([^\\]]+)\\]`,
  "g",
);
const DERIVED = /^(?:var|calc|env|url|min|max|clamp|color-mix)\(/;

export type Violation = { line: number; className: string };

/** Devuelve las clases arbitrarias fuera de escala de un fichero, con su línea. */
export function findViolations(source: string): Violation[] {
  const out: Violation[] = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Se reinicia por línea: así el `lastIndex` del regex global no arrastra
    // estado de una línea a la siguiente.
    for (const match of lines[i].matchAll(ARBITRARY)) {
      if (DERIVED.test(match[1])) continue;
      out.push({ line: i + 1, className: match[0] });
    }
  }
  return out;
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry.name)) yield full;
  }
}

/** Recorre `web/src` y devuelve el número de valores arbitrarios encontrados. */
export async function check(src: string, cwd: string): Promise<number> {
  const files: string[] = [];
  for await (const file of walk(src)) files.push(file);

  let found = 0;
  for (const file of files.sort()) {
    for (const hit of findViolations(await readFile(file, "utf8"))) {
      console.error(`${relative(cwd, file)}:${hit.line}  ${hit.className}`);
      found++;
    }
  }

  if (found > 0) {
    console.error(
      `\n${found} valor(es) arbitrario(s) fuera de la escala. ` +
        "Añade el token en web/src/globals.css y usa la utilidad " +
        "(AGENTS.md § Sistema de diseño).",
    );
    return found;
  }

  console.log(
    `Diseño OK: ${files.length} ficheros sin valores arbitrarios fuera de escala.`,
  );
  return 0;
}

// Solo actúa si se ejecuta como programa: importarlo desde un test no debe
// recorrer el disco ni tocar el código de salida.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const src = fileURLToPath(new URL("../src/", import.meta.url));
  process.exit((await check(src, process.cwd())) > 0 ? 1 : 0);
}
