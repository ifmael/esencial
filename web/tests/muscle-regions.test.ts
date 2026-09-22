// El vocabulario de sub-regiones vive en dos sitios que tienen que decir lo
// mismo: el mapa anatómico (web) y lo que valida la API (`api/src/muscle-regions.ts`).
// Este test cruza las dos tablas: si una región cambia de nombre en el dibujo y
// la otra no, falla.

import { describe, expect, it } from "vitest";
import { MUSCLE_REGION_GROUPS } from "../../api/src/muscle-regions";
import { BACK_REGIONS, FRONT_REGIONS } from "../src/components/body-map/data";
import {
  canonicalRegionId,
  MUSCLE_REGIONS,
  regionLabel,
  regionsOfGroup,
} from "../src/components/body-map/regions";
import { GROUP_LABELS } from "../src/components/grouped-exercises";

const PAINTED = [...FRONT_REGIONS, ...BACK_REGIONS].filter(
  (r) => r.tag !== null,
);

describe("MUSCLE_REGIONS", () => {
  it("es exactamente el vocabulario que valida la API", () => {
    expect(MUSCLE_REGIONS.map((r) => r.id).sort()).toEqual(
      Object.keys(MUSCLE_REGION_GROUPS).sort(),
    );
    for (const r of MUSCLE_REGIONS) {
      expect(MUSCLE_REGION_GROUPS[r.id], r.id).toBe(r.group);
    }
  });

  it("una sub-región por músculo: sin lado, con grupo y sin anatomía de relleno", () => {
    // Las dos mitades del dibujo son el mismo músculo, y cada una cuelga de un
    // grupo de la taxonomía.
    for (const region of PAINTED) {
      const canonical = MUSCLE_REGIONS.find(
        (r) => r.id === canonicalRegionId(region.id),
      );
      expect(canonical?.group, region.id).toBe(region.tag);
    }
    expect(new Set(PAINTED.map((r) => canonicalRegionId(r.id))).size).toBe(
      MUSCLE_REGIONS.length,
    );

    for (const r of MUSCLE_REGIONS) {
      expect(r.id, r.id).not.toMatch(/-(left|right)$/);
      expect(r.label, r.id).not.toMatch(/\((izquierda|derecha)\)/);
      expect(Object.keys(GROUP_LABELS), r.id).toContain(r.group);
    }
    // Cabeza, manos, pies y articulaciones se dibujan, no se filtran.
    for (const filler of ["head", "face", "hand", "foot", "knee", "elbow"]) {
      expect(
        MUSCLE_REGIONS.some((r) => r.id.startsWith(filler)),
        filler,
      ).toBe(false);
    }
  });

  it("agrupa por grupo padre y ordena por nombre", () => {
    const labels = MUSCLE_REGIONS.map((r) => r.label);
    expect(labels).toEqual(
      [...labels].sort((a, b) =>
        new Intl.Collator("es", { sensitivity: "base" }).compare(a, b),
      ),
    );
    const pecho = regionsOfGroup("pecho").map((r) => r.id);
    expect(pecho).toEqual(["chest-lower", "chest-upper"]);
    for (const r of regionsOfGroup("pecho")) expect(r.group).toBe("pecho");
    expect(regionsOfGroup("inexistente")).toEqual([]);
  });

  it("regionLabel traduce el id y deja pasar los desconocidos", () => {
    expect(regionLabel("chest-upper")).toBe("Pecho superior (clavicular)");
    expect(regionLabel("spine")).toBe("Columna");
    expect(regionLabel("otra-cosa")).toBe("otra-cosa");
  });
});
