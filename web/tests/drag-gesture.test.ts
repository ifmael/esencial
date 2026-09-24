// Gesto del mapa 3D: distinguir un toque (elige el músculo) de un arrastre
// (gira la figura). Sin WebGL: es la lógica que decide cuándo capturar el
// puntero, que si se pide antes de tiempo se come el `click` del lienzo.

import { describe, expect, it } from "vitest";
import { dragStep } from "../src/components/body-map/drag";

describe("dragStep", () => {
  it("un movimiento por debajo del umbral no es arrastre ni gira", () => {
    const s = dragStep({ x: 100, moved: false }, 102);
    expect(s).toEqual({
      state: { x: 100, moved: false },
      dx: 0,
      capture: false,
    });
  });

  it("al superar el umbral empieza el arrastre, gira y pide la captura una vez", () => {
    const first = dragStep({ x: 100, moved: false }, 110);
    expect(first).toEqual({
      state: { x: 110, moved: true },
      dx: 10,
      capture: true,
    });
    const next = dragStep(first.state, 115);
    expect(next).toEqual({
      state: { x: 115, moved: true },
      dx: 5,
      capture: false,
    });
  });

  it("funciona hacia la izquierda", () => {
    expect(dragStep({ x: 100, moved: false }, 90).dx).toBe(-10);
  });
});
