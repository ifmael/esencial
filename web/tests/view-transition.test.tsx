// View Transitions: el helper degrada sin API o con movimiento reducido, y el
// cambio de semana solo deja que el navegador fotografíe la rejilla nueva
// cuando la semana ya cambió y sus datos llegaron.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeekGrid } from "../src/components/week-grid";
import { runViewTransition } from "../src/lib/view-transition";

/** El documento sin la API tipada: así el test puede quitarla y ponerla. */
type Doc = { startViewTransition?: unknown };
const doc = document as unknown as Doc;

type FakeTransition = { updateCallbackDone: Promise<void> };

/** Sustituye la API: corre el callback como el navegador y guarda cada
 * transición para que el test observe cuándo termina su actualización. */
function stubViewTransitions() {
  const transitions: FakeTransition[] = [];
  doc.startViewTransition = vi.fn((cb: () => void | Promise<void>) => {
    const done = Promise.resolve().then(cb);
    const t = { updateCallbackDone: done, finished: done, ready: done };
    transitions.push(t);
    return t;
  });
  return transitions;
}

function reducedMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes("reduce"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  delete doc.startViewTransition;
  delete document.documentElement.dataset.weekDir;
  reducedMotion(false);
});

describe("runViewTransition", () => {
  it("sin la API aplica el cambio directamente", async () => {
    const update = vi.fn();
    await runViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it("con la API aplica el cambio dentro de la transición", async () => {
    const transitions = stubViewTransitions();
    const update = vi.fn();
    await runViewTransition(update);
    expect(transitions).toHaveLength(1);
    expect(update).toHaveBeenCalledOnce();
  });

  it("con movimiento reducido no anima: cambio directo", async () => {
    stubViewTransitions();
    reducedMotion(true);
    const update = vi.fn();
    await runViewTransition(update);
    expect(doc.startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});

describe("WeekGrid: transición al cambiar de semana", () => {
  const grid = (isoWeek: string, busy: boolean, onShift = vi.fn()) => (
    <WeekGrid isoWeek={isoWeek} busy={busy} onShiftWeek={onShift}>
      {() => null}
    </WeekGrid>
  );

  it("espera a la semana nueva y a sus datos antes de soltar la foto", async () => {
    const transitions = stubViewTransitions();
    const onShift = vi.fn();
    const { rerender } = render(grid("2026-W10", false, onShift));

    let settled = false;
    fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
    void transitions[0].updateCallbackDone.then(() => (settled = true));

    await act(async () => {});
    expect(onShift).toHaveBeenCalledWith(1);
    expect(document.documentElement.dataset.weekDir).toBe("next");
    expect(settled).toBe(false); // la semana aún no ha cambiado

    await act(async () => rerender(grid("2026-W11", true, onShift)));
    expect(settled).toBe(false); // semana nueva, datos cargando

    await act(async () => rerender(grid("2026-W11", false, onShift)));
    expect(settled).toBe(true);
  });

  it("con datos lentos suelta la foto a los 400 ms: la página no se congela", async () => {
    vi.useFakeTimers();
    try {
      const transitions = stubViewTransitions();
      const onShift = vi.fn();
      const { rerender } = render(grid("2026-W10", false, onShift));
      let settled = false;
      fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
      void transitions[0].updateCallbackDone.then(() => (settled = true));
      await act(async () => rerender(grid("2026-W11", true, onShift)));
      await act(async () => vi.advanceTimersByTime(399));
      expect(settled).toBe(false);
      await act(async () => vi.advanceTimersByTime(1));
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("la semana anterior marca el sentido contrario", async () => {
    stubViewTransitions();
    const onShift = vi.fn();
    render(grid("2026-W10", false, onShift));
    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    await act(async () => {});
    expect(onShift).toHaveBeenCalledWith(-1);
    expect(document.documentElement.dataset.weekDir).toBe("prev");
  });

  it("sin la API cambia de semana al momento", () => {
    const onShift = vi.fn();
    render(grid("2026-W10", false, onShift));
    fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
    expect(onShift).toHaveBeenCalledWith(1);
  });
});
