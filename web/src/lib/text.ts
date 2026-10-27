/** Minúsculas y sin tildes: «Nutrición» y «nutricion» son lo mismo. Un solo
 *  plegado para la búsqueda de recetas, la de ejercicios y la paleta ⌘K (lo ata
 *  `tests/text.test.ts`). No recorta espacios: cada superficie decide si lo hace. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
