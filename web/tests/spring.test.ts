// Muelles M3E: la curva que se pasa a CSS como `linear()` muestreado.
import { describe, expect, it } from "vitest";
import { SPRINGS, springCurve, toLinear } from "../src/lib/spring";

const max = (xs: number[]) => Math.max(...xs);

describe("springCurve", () => {
  it("un muelle subamortiguado rebota: se pasa de 1 y vuelve", () => {
    const { points } = springCurve({ stiffness: 800, dampingRatio: 0.6 });
    expect(max(points)).toBeGreaterThan(1.02);
    expect(max(points)).toBeLessThan(1.2);
    expect(points.at(-1)).toBe(1);
  });

  it("con amortiguación crítica no rebota nunca y crece siempre", () => {
    const { points } = springCurve({ stiffness: 1600, dampingRatio: 1 });
    expect(max(points)).toBeLessThanOrEqual(1);
    for (let i = 1; i < points.length; i++)
      expect(points[i]).toBeGreaterThanOrEqual(points[i - 1]);
    expect(points[0]).toBe(0);
    expect(points.at(-1)).toBe(1);
  });

  it("más rigidez asienta antes", () => {
    const soft = springCurve({ stiffness: 200, dampingRatio: 0.8 });
    const stiff = springCurve({ stiffness: 800, dampingRatio: 0.8 });
    expect(stiff.durationMs).toBeLessThan(soft.durationMs);
  });
});

describe("tokens de muelle M3E", () => {
  it("los espaciales rebotan y los de efectos no", () => {
    for (const [name, spring] of Object.entries(SPRINGS)) {
      const peak = max(springCurve(spring).points);
      if (name.startsWith("spatial")) expect(peak, name).toBeGreaterThan(1);
      else expect(peak, name).toBeLessThanOrEqual(1);
    }
  });

  it("rápido < por defecto < lento, en las dos familias", () => {
    for (const family of ["spatial", "effects"] as const) {
      const d = (speed: string) =>
        springCurve(SPRINGS[`${family}-${speed}` as keyof typeof SPRINGS])
          .durationMs;
      expect(d("fast")).toBeLessThan(d("default"));
      expect(d("default")).toBeLessThan(d("slow"));
    }
  });
});

describe("toLinear", () => {
  it("escribe un linear() de CSS que empieza en 0 y acaba en 1", () => {
    const css = toLinear([0, 0.5, 1.1, 1]);
    expect(css).toBe("linear(0, 0.5, 1.1, 1)");
  });

  it("redondea a tres decimales", () => {
    expect(toLinear([0, 0.123456, 1])).toBe("linear(0, 0.123, 1)");
  });
});
