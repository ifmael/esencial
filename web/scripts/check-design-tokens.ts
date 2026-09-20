// Guardarraíl del sistema de diseño (AGENTS.md § "Sistema de diseño").
//
// Vigila las dos formas de saltarse el sistema:
//
// 1. Clases arbitrarias de Tailwind que inventan un valor —`rounded-[7px]`,
//    `text-[10px]`— en vez de usar la escala de `globals.css`. Se aceptan los
//    valores derivados (`var()`, `calc()`, `env()`, `min()`, `clamp()`): no
//    inventan una escala, la consumen o la calculan.
// 2. Clases de piel aplicadas a mano en una pantalla (`className="card"`,
//    `btn-primary`, `input`, `badge-*`): la piel de una primitiva se consume a
//    través de la primitiva (`<Card>`, `<Button>`, `<Input>`, `<Badge>`). El
//    único fichero exento es `components/ui.tsx`, que es donde vive esa piel.
//
// Corre dentro de `pnpm lint`.
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

/** Piel de una primitiva: se usa a través de `<Card>`, `<Button>`, `<Input>`,
 * `<Textarea>` o `<Badge>`, nunca escribiendo la clase. Las utilidades
 * compartidas (`.section-label`, `.list-row`, `.card-interactive`, `.skeleton`)
 * no entran aquí: esas sí se aplican tal cual. */
const SKIN_CLASSES: Record<string, true> = {
  card: true,
  btn: true,
  "btn-primary": true,
  "btn-secondary": true,
  "btn-ghost": true,
  input: true,
  "input-error": true,
  "badge-pending": true,
  "badge-done": true,
  "badge-neutral": true,
};

/** Valores de `className` en sus tres formas corrientes (comillas dobles,
 * simples, o plantilla sin anidar). */
const CLASS_ATTR = /className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;

export type Violation = { line: number; className: string };

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === "\n") line++;
  return line;
}

/** Clases arbitrarias que inventan un valor fuera de la escala. */
export function findArbitraryValues(source: string): Violation[] {
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

/** Clases de piel escritas a mano en una pantalla. */
export function findSkinClassUsage(source: string): Violation[] {
  const out: Violation[] = [];
  for (const attr of source.matchAll(CLASS_ATTR)) {
    const value = attr[1] ?? attr[2] ?? attr[3] ?? "";
    for (const token of value.split(/\s+/)) {
      if (SKIN_CLASSES[token]) {
        out.push({ line: lineOf(source, attr.index), className: token });
      }
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

/** Recorre `web/src` y devuelve el número de incumplimientos encontrados. */
export async function check(src: string, cwd: string): Promise<number> {
  const files: string[] = [];
  for await (const file of walk(src)) files.push(file);

  let found = 0;
  for (const file of files.sort()) {
    const source = await readFile(file, "utf8");
    const isSkinSource = file.endsWith(join("components", "ui.tsx"));
    const hits = [
      ...findArbitraryValues(source),
      ...(isSkinSource ? [] : findSkinClassUsage(source)),
    ];
    for (const hit of hits) {
      console.error(`${relative(cwd, file)}:${hit.line}  ${hit.className}`);
      found++;
    }
  }

  if (found > 0) {
    console.error(
      `\n${found} incumplimiento(s) del sistema de diseño. Usa un token y la ` +
        "primitiva correspondiente (AGENTS.md § Sistema de diseño); el " +
        "catálogo de variantes está en la ruta /ui.",
    );
    return found;
  }

  console.log(
    `Diseño OK: ${files.length} ficheros sin valores arbitrarios ni piel a mano.`,
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
