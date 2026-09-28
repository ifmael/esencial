// Escape cierra solo la capa de encima (un menú dentro de un diálogo cierra el
// menú, no el diálogo), y un Escape que ya gestionó otro (dnd-kit cancelando un
// arrastre de teclado) no cierra nada.
import { afterEach, describe, expect, it, vi } from "vitest";
import { pushEscape } from "../src/lib/escape-stack";

// Como en el navegador: el evento nace en el elemento con foco y sube hasta
// `window`, pasando por los listeners del documento.
const press = (init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", {
    key: "Escape",
    cancelable: true,
    bubbles: true,
    ...init,
  });
  document.body.dispatchEvent(e);
  return e;
};

const pops: (() => void)[] = [];
afterEach(() => {
  while (pops.length) pops.pop()?.();
});

describe("pila de Escape", () => {
  it("cierra solo la capa de encima", () => {
    const dialog = vi.fn();
    const menu = vi.fn();
    pops.push(pushEscape(dialog), pushEscape(menu));
    press();
    expect(menu).toHaveBeenCalledTimes(1);
    expect(dialog).not.toHaveBeenCalled();
  });

  it("al quitar la de encima, el siguiente Escape va a la de debajo", () => {
    const dialog = vi.fn();
    const menu = vi.fn();
    const popDialog = pushEscape(dialog);
    const popMenu = pushEscape(menu);
    popMenu();
    press();
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(menu).not.toHaveBeenCalled();
    popDialog();
  });

  it("un Escape ya gestionado (defaultPrevented) no cierra nada", () => {
    const dialog = vi.fn();
    pops.push(pushEscape(dialog));
    const cancelDrag = (e: KeyboardEvent) => e.preventDefault();
    // dnd-kit escucha en el documento, en captura: llega antes.
    document.addEventListener("keydown", cancelDrag, true);
    press();
    document.removeEventListener("keydown", cancelDrag, true);
    expect(dialog).not.toHaveBeenCalled();
  });

  it("otras teclas no cierran", () => {
    const dialog = vi.fn();
    pops.push(pushEscape(dialog));
    press({ key: "Enter" });
    expect(dialog).not.toHaveBeenCalled();
  });
});
