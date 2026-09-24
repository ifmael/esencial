// Lógica pura de la paleta de comandos (⌘K): puntuar, ordenar y moverse.
// Sin React ni DOM, para probarla sola (web/tests/command-palette.test.ts).

export type CommandGroup = "Acciones" | "Pantallas" | "Recetas" | "Ejercicios";

export type Command = {
  id: string;
  label: string;
  group: CommandGroup;
  href: string;
  /** Sinónimos que casan, por debajo del nombre («deporte» → Plan de fuerza). */
  keywords?: string[];
  /** Solo aparece al escribir (recetas y ejercicios: son cientos). */
  searchOnly?: boolean;
};

/** Minúsculas y sin tildes: «Nutrición» y «nutricion» son lo mismo. */
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Una palabra de la consulta contra el texto: prefijo 4, inicio de palabra 3,
 * subcadena 2, letras en orden desde un inicio de palabra 1 («pbc» → «Press
 * banca», pero «rec» no casa con «Crema»); null si no casa. */
function scoreWord(word: string, text: string): number | null {
  if (text.startsWith(word)) return 4;
  const starts = [...text.matchAll(/(?:^|[\s(/-])\S/g)].map(
    (m) => (m.index ?? 0) + m[0].length - 1,
  );
  if (starts.some((at) => text.startsWith(word, at))) return 3;
  if (text.includes(word)) return 2;
  for (const at of starts) {
    if (text[at] !== word[0]) continue;
    let i = 0;
    for (const ch of text.slice(at)) if (ch === word[i]) i++;
    if (i >= word.length) return 1;
  }
  return null;
}

/** Todas las palabras deben casar; la nota es la de la peor (lo que el ojo
 * nota), más una décima por lo corto del texto para desempatar. */
export function scoreMatch(query: string, text: string): number | null {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const t = fold(text);
  let worst = Number.POSITIVE_INFINITY;
  for (const w of words) {
    const s = scoreWord(w, t);
    if (s === null) return null;
    worst = Math.min(worst, s);
  }
  return worst + 1 / (10 + t.length);
}

export function rankCommands(
  commands: readonly Command[],
  query: string,
  limit = 50,
): Command[] {
  if (!query.trim())
    return commands.filter((c) => !c.searchOnly).slice(0, limit);
  const scored: { c: Command; s: number; i: number }[] = [];
  commands.forEach((c, i) => {
    const byName = scoreMatch(query, c.label);
    const byKeyword = Math.max(
      -1,
      ...(c.keywords ?? []).map((k) => (scoreMatch(query, k) ?? 0) - 1),
    );
    const s = Math.max(byName ?? -1, byKeyword > 0 ? byKeyword : -1);
    if (s > 0) scored.push({ c, s, i });
  });
  // Array#sort es estable: a igual nota queda el orden original.
  return scored
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

/** Índice activo tras pulsar ↑/↓, dando la vuelta; -1 sin resultados. */
export const moveActive = (current: number, delta: number, count: number) =>
  count === 0 ? -1 : (((current + delta) % count) + count) % count;
