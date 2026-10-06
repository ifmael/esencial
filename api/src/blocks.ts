// Regla de los bloques de ejercicios (superseries): una fila marcada con
// `superset` va pegada a la siguiente. La comparten el día y las plantillas
// —misma validez, distinto nombre de campo en el error— así que vive aquí y la
// API la aplica antes de guardar.

/** Entrada mínima para validar el bloque (día o plantilla). */
export type BlockItem = {
  exerciseId: number;
  superset?: boolean | null;
  restSecs?: number | null;
  restAfterSecs?: number | null;
};

/** Tipo de cada ejercicio implicado (`strength`, `running`…). */
export type BlockKind = { id: number; kind: string };

/** Motivo por el que el bloque no es válido, o null si lo es. Solo la fuerza se
 *  encadena; el último ejercicio no puede marcar y el encadenado va sin descanso. */
export function blockError(
  items: readonly BlockItem[],
  exercises: readonly BlockKind[],
): string | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.superset) continue;
    const next = items[i + 1];
    if (!next) return "El último ejercicio no puede encadenarse al siguiente";
    const kind = exercises.find((e) => e.id === item.exerciseId)?.kind;
    const nextKind = exercises.find((e) => e.id === next.exerciseId)?.kind;
    if (kind !== "strength" || nextKind !== "strength")
      return "Solo los ejercicios de fuerza pueden ir encadenados";
    if (item.restSecs != null || item.restAfterSecs != null)
      return "Un ejercicio encadenado no lleva descanso propio";
  }
  return null;
}
