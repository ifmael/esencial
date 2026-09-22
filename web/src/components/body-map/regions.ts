// Sub-regiones musculares: el vocabulario fino con el que se etiquetan y se
// filtran los ejercicios. Se deriva del mapa anatómico — el músculo es el mismo
// en izquierda y derecha, así que el id canónico pierde el lado — y cada una
// cuelga de uno de los diez grupos de `GROUP_LABELS`. La anatomía de relleno
// (cabeza, manos, pies, articulaciones) no entra: se dibuja, no se filtra.
//
// La API valida contra su espejo (`api/src/muscle-regions.ts`); el test
// `web/tests/muscle-regions.test.ts` falla si las dos tablas divergen.
import { BACK_REGIONS, FRONT_REGIONS } from "./data";

export type MuscleRegion = {
  /** Id canónico, sin lado: el que guarda la API. */
  id: string;
  /** Nombre en español sin lado, tal como se pinta. */
  label: string;
  /** Grupo padre, de `GROUP_LABELS`. */
  group: string;
};

const SIDE_ID = /-(left|right)$/;
const SIDE_LABEL = / \((izquierda|derecha)\)$/;
const collator = new Intl.Collator("es", { sensitivity: "base" });

/** Id canónico de una región del dibujo: `chest-upper-left` → `chest-upper`. */
export function canonicalRegionId(rawId: string): string {
  return rawId.replace(SIDE_ID, "");
}

/** Un músculo por región con grupo, en orden alfabético por su nombre. */
export const MUSCLE_REGIONS: MuscleRegion[] = (() => {
  const byId = new Map<string, MuscleRegion>();
  for (const r of [...FRONT_REGIONS, ...BACK_REGIONS]) {
    if (!r.tag) continue;
    const id = canonicalRegionId(r.id);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        label: r.label.replace(SIDE_LABEL, ""),
        group: r.tag,
      });
    }
  }
  return [...byId.values()].sort((a, b) => collator.compare(a.label, b.label));
})();

const LABELS = new Map(MUSCLE_REGIONS.map((r) => [r.id, r.label]));

/** Nombre de una sub-región; un id desconocido se muestra tal cual. */
export function regionLabel(id: string): string {
  return LABELS.get(id) ?? id;
}

/** Sub-regiones de un grupo padre, en orden alfabético. */
export function regionsOfGroup(group: string): MuscleRegion[] {
  return MUSCLE_REGIONS.filter((r) => r.group === group);
}
