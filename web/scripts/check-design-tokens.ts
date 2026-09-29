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
//    través de la primitiva (`<Card>`, `<Button>`, `<Input>`, `<Badge>`…). Los
//    únicos ficheros exentos son los de las primitivas (`SKIN_SOURCES`).
// 3. La escala cruda de Tailwind y la del sistema anterior (`findRawScale`).
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
 * `<Textarea>`, `<Badge>`, `<Chip>`, `<Fab>`, `<Field>`, `<Alert>`,
 * `<Dialog>`, `<Sheet>`…, nunca escribiendo la clase. Las utilidades
 * compartidas (`.section-label`, `.list-row`, `.card-interactive`,
 * `.skeleton`, `.state`, `.stagger`, `.type-move`, `.tabular`, `.text-e`,
 * `motion-*`) no entran aquí: esas sí se aplican tal cual. */
const SKIN_CLASSES: Record<string, true> = {
  card: true,
  "card-elevated": true,
  "card-filled": true,
  "card-outlined": true,
  "card-tonal": true,
  btn: true,
  "btn-filled": true,
  "btn-tonal": true,
  "btn-outlined": true,
  "btn-text": true,
  "btn-danger": true,
  fab: true,
  chip: true,
  connected: true,
  input: true,
  field: true,
  "field-label": true,
  checkbox: true,
  switch: true,
  "badge-pending": true,
  "badge-done": true,
  "badge-neutral": true,
  "badge-accent": true,
  alert: true,
  "alert-error": true,
  "alert-info": true,
  dialog: true,
  sheet: true,
  snackbar: true,
};

/** Ficheros donde vive la piel (las primitivas): los únicos que la escriben. */
const SKIN_SOURCES = ["ui.tsx", "overlay.tsx", "expressive.tsx"];

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

/** Fuera de la escala: la escala cruda de Tailwind (`text-sm`, `rounded-lg`,
 * `shadow-xl`, `bg-black/40`, `text-white`, `bg-red-500`, `duration-150`,
 * `ease-out`) y los nombres del sistema anterior (`text-caption`,
 * `rounded-card`, `text-text-secondary`, `bg-surface-muted`…). `globals.css`
 * vacía esos espacios de nombres (`--text-*: initial`…), así que ninguna de
 * estas clases genera CSS: sin este aviso fallarían en silencio. Se buscan
 * dentro de las cadenas (donde viven las clases), nunca en comentarios. */
const RAW_SCALE = new RegExp(
  "^(?:" +
    [
      // Tailwind crudo
      "text-(?:xs|sm|base|lg|[2-9]?xl)",
      "rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?(?:-(?:sm|md|lg|[2-4]xl))",
      "rounded",
      "shadow(?:-(?:xs|sm|md|lg|2?xl|inner))?",
      "(?:bg|from|via|to|text|border|fill|stroke|ring|outline|divide|decoration|accent|caret)-(?:black|white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d+)(?:/\\d+)?",
      "duration-\\d+",
      "ease-(?:linear|in|out|in-out)",
      "animate-(?:spin|ping|pulse|bounce)",
      // Sistema anterior (variante A)
      "text-(?:micro|caption|body|lead|title|display)",
      "rounded(?:-[trblse]{1,2})?-(?:control|panel|card|chip)",
      "shadow-(?:card|raised|inset|up)",
      "ease-out-quart",
      "duration-(?:fast|base|slow)",
      "(?:bg|text|border|fill|stroke|ring|divide|from|to)-(?:text|text-secondary|surface-muted|border|border-strong|primary-soft|primary-soft-strong|primary-dark|background|pending|pending-bg|pending-text|done|done-bg|done-text)(?:/\\d+)?",
    ].join("|") +
    ")$",
);
const STRING_LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

export function findRawScale(source: string): Violation[] {
  const out: Violation[] = [];
  for (const lit of source.matchAll(STRING_LITERAL)) {
    const value = lit[1] ?? lit[2] ?? lit[3] ?? "";
    for (const token of value.split(/[\s"'`{}$]+/)) {
      // `md:hover:text-sm` → la utilidad es lo que va tras el último `:`.
      if (RAW_SCALE.test(token.slice(token.lastIndexOf(":") + 1))) {
        out.push({ line: lineOf(source, lit.index), className: token });
      }
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
    const isSkinSource = SKIN_SOURCES.some((name) =>
      file.endsWith(join("components", name)),
    );
    const hits = [
      ...findArbitraryValues(source),
      ...findRawScale(source),
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
