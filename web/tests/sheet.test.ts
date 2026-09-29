// Hoja inferior: arrastrar el asa hacia abajo la cierra si se baja lo bastante
// o se suelta con velocidad; si no, vuelve a su sitio.
import { describe, expect, it } from "vitest";
import { sheetDrag, sheetRelease } from "../src/lib/sheet";

describe("sheetDrag", () => {
  it("hacia abajo sigue al dedo", () => {
    expect(sheetDrag(120)).toBe(120);
  });

  it("hacia arriba se resiste (no se despega del borde)", () => {
    expect(sheetDrag(-100)).toBeLessThan(0);
    expect(sheetDrag(-100)).toBeGreaterThan(-30);
  });
});

describe("sheetRelease", () => {
  const height = 600;

  it("soltar tras bajar más de un tercio cierra", () => {
    expect(sheetRelease({ dy: 250, velocity: 0, height })).toBe("close");
  });

  it("soltar tras un arrastre corto y lento vuelve a su sitio", () => {
    expect(sheetRelease({ dy: 80, velocity: 0.1, height })).toBe("settle");
  });

  it("un tirón rápido hacia abajo cierra aunque el recorrido sea corto", () => {
    expect(sheetRelease({ dy: 40, velocity: 1.2, height })).toBe("close");
  });

  it("un tirón rápido hacia arriba nunca cierra", () => {
    expect(sheetRelease({ dy: -20, velocity: -2, height })).toBe("settle");
  });
});
