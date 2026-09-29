// Snackbar con «Deshacer»: la acción ya se aplicó; el aviso da una ventana
// para revertirla. Uno a la vez: el nuevo sustituye al anterior.
import { describe, expect, it, vi } from "vitest";
import { createSnackbarStore } from "../src/lib/snackbar";

function setup(duration = 5000) {
  let fire: (() => void) | null = null;
  const timers = {
    set: vi.fn((fn: () => void) => {
      fire = fn;
      return 1;
    }),
    clear: vi.fn(),
  };
  const store = createSnackbarStore({ duration, timers });
  return { store, timers, expire: () => fire?.() };
}

describe("snackbar", () => {
  it("mostrar deja visible el mensaje con su acción", () => {
    const { store } = setup();
    store.show({ message: "Ejercicio quitado", onUndo: () => {} });
    expect(store.get()?.message).toBe("Ejercicio quitado");
    expect(store.get()?.canUndo).toBe(true);
  });

  it("Deshacer revierte una sola vez y cierra", () => {
    const { store } = setup();
    const onUndo = vi.fn();
    store.show({ message: "Quitado", onUndo });
    store.undo();
    store.undo();
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(store.get()).toBeNull();
  });

  it("al caducar se cierra sin revertir, y deshacer ya no hace nada", () => {
    const { store, expire } = setup();
    const onUndo = vi.fn();
    store.show({ message: "Quitado", onUndo });
    expire();
    expect(store.get()).toBeNull();
    store.undo();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("uno nuevo sustituye al anterior: el viejo ya no se puede deshacer", () => {
    const { store, timers } = setup();
    const first = vi.fn();
    const second = vi.fn();
    store.show({ message: "Uno", onUndo: first });
    store.show({ message: "Dos", onUndo: second });
    expect(timers.clear).toHaveBeenCalled();
    expect(store.get()?.message).toBe("Dos");
    store.undo();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("cerrar a mano no revierte", () => {
    const { store } = setup();
    const onUndo = vi.fn();
    store.show({ message: "Quitado", onUndo });
    store.dismiss();
    expect(store.get()).toBeNull();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("sin onUndo es un aviso sin acción", () => {
    const { store } = setup();
    store.show({ message: "No se pudo deshacer" });
    expect(store.get()?.canUndo).toBe(false);
  });

  it("avisa a los suscriptores en cada cambio", () => {
    const { store } = setup();
    const seen: (string | null)[] = [];
    store.subscribe(() => seen.push(store.get()?.message ?? null));
    store.show({ message: "Uno", onUndo: () => {} });
    store.undo();
    expect(seen).toEqual(["Uno", null]);
  });
});
