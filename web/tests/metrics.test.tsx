// Datos visibles (dirección C): anillos de progreso y cifras que cuentan al
// aparecer. Se prueba lo que un consumidor observa: el valor anunciado, el
// progreso acotado y que con movimiento reducido la cifra final esté ya ahí.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountUp, countUpValue, ProgressRing } from "../src/components/metrics";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduce && q.includes("prefers-reduced-motion"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

describe("countUpValue", () => {
  it("empieza en 0, acaba exacto en el objetivo y nunca lo sobrepasa", () => {
    expect(countUpValue(12, 0)).toBe(0);
    expect(countUpValue(12, 1)).toBe(12);
    for (const t of [0.1, 0.3, 0.5, 0.8, 0.99])
      expect(countUpValue(12, t)).toBeLessThanOrEqual(12);
  });

  it("crece de forma monótona y redondea a entero", () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = countUpValue(20, t);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("acota t fuera de [0,1]", () => {
    expect(countUpValue(5, -1)).toBe(0);
    expect(countUpValue(5, 3)).toBe(5);
  });
});

describe("CountUp", () => {
  it("con movimiento reducido pinta la cifra final desde el primer render", () => {
    stubReducedMotion(true);
    const { container } = render(<CountUp value={18} />);
    expect(container.querySelector("[aria-hidden]")?.textContent).toBe("18");
  });

  it("con movimiento cuenta hasta el valor y el lector oye solo el final", () => {
    stubReducedMotion(false);
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);

    const { container } = render(<CountUp value={18} label="series hechas" />);
    expect(container.querySelector("[aria-hidden]")?.textContent).toBe("0");
    // El nombre accesible es el valor final, no el número intermedio.
    expect(screen.getByText("18 series hechas")).toBeTruthy();

    now = 5000;
    act(() => {
      for (const cb of frames.splice(0)) cb(now);
    });
    expect(container.querySelector("[aria-hidden]")?.textContent).toBe("18");
  });

  it("al cambiar el valor cuenta desde el que se veía, no desde 0", () => {
    stubReducedMotion(false);
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const visible = () =>
      Number(container.querySelector("[aria-hidden]")?.textContent);

    const { container, rerender } = render(<CountUp value={18} />);
    now = 5000;
    act(() => {
      for (const cb of frames.splice(0)) cb(now);
    });
    expect(visible()).toBe(18);

    // Marcar una serie más: el primer fotograma sigue en 18, nunca vuelve a 0.
    rerender(<CountUp value={19} />);
    expect(visible()).toBe(18);
    act(() => {
      for (const cb of frames.splice(0)) cb(now + 1);
    });
    expect(visible()).toBeGreaterThanOrEqual(18);
    now += 5000;
    act(() => {
      for (const cb of frames.splice(0)) cb(now);
    });
    expect(visible()).toBe(19);
  });
});

describe("ProgressRing", () => {
  it("expone su progreso como progressbar con nombre", () => {
    render(<ProgressRing value={3} max={4} label="Sesiones de la semana" />);
    const bar = screen.getByRole("progressbar", {
      name: "Sesiones de la semana",
    });
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("4");
  });

  it("acota el valor a [0, max] y tolera max 0", () => {
    const { rerender } = render(
      <ProgressRing value={9} max={4} label="Series" />,
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "4",
    );
    rerender(<ProgressRing value={2} max={0} label="Series" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0",
    );
  });
});
