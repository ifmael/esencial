// Formas abstractas M3E: todas se muestrean con los mismos puntos en los mismos
// ángulos, así que cualquier pareja se puede transformar (morph) interpolando
// el atributo `d`.
import { describe, expect, it } from "vitest";
import { SHAPES, type ShapeName, shapePath, shapePoints } from "../src/lib/shapes";

const names = Object.keys(SHAPES) as ShapeName[];

/** Máximos locales del radio: los lóbulos de la forma. */
function lobes(name: ShapeName): number {
  const r = shapePoints(name).map(([x, y]) => Math.hypot(x - 0.5, y - 0.5));
  let peaks = 0;
  for (let i = 0; i < r.length; i++) {
    const prev = r[(i - 1 + r.length) % r.length];
    const next = r[(i + 1) % r.length];
    if (r[i] > prev && r[i] >= next) peaks++;
  }
  return peaks;
}

describe("formas M3E", () => {
  it("incluye el repertorio que pide el sistema", () => {
    for (const n of [
      "circle",
      "cookie-4",
      "cookie-7",
      "cookie-9",
      "cookie-12",
      "clover",
      "sunny",
      "flower",
      "soft-diamond",
      "pill",
    ])
      expect(names).toContain(n);
  });

  it("todas caben en la caja unidad y la tocan (sin márgenes muertos)", () => {
    for (const n of names) {
      const pts = shapePoints(n);
      const xs = pts.map(([x]) => x);
      const ys = pts.map(([, y]) => y);
      expect(Math.min(...xs, ...ys), n).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs, ...ys), n).toBeLessThanOrEqual(1);
      expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), n).toBeCloseTo(1, 2);
    }
  });

  it("todas tienen el mismo número de puntos: se pueden transformar entre sí", () => {
    const count = shapePoints("circle").length;
    for (const n of names) expect(shapePoints(n).length, n).toBe(count);
  });

  it("una galleta de n lados tiene n lóbulos", () => {
    expect(lobes("cookie-4")).toBe(4);
    expect(lobes("cookie-7")).toBe(7);
    expect(lobes("cookie-9")).toBe(9);
    expect(lobes("cookie-12")).toBe(12);
    expect(lobes("clover")).toBe(4);
  });

  it("el trazo es un camino cerrado escalado al tamaño pedido", () => {
    const d = shapePath("cookie-9", 48);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    expect(Math.max(...nums)).toBeLessThanOrEqual(48);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
  });
});
