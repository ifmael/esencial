// Escape cierra la capa de encima y nada más. Diálogos, hojas y menús se
// apilan al abrirse; un único listener en `window` avisa solo a la última.
// Un Escape que otro ya gestionó (`defaultPrevented`: dnd-kit cancelando un
// arrastre de teclado) no cierra nada.

const stack: (() => void)[] = [];

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const top = stack.at(-1);
  if (!top) return;
  e.preventDefault();
  top();
}

/** Apila `onClose` como capa de encima; devuelve la función que la quita. */
export function pushEscape(onClose: () => void): () => void {
  if (stack.length === 0) window.addEventListener("keydown", onKey);
  stack.push(onClose);
  return () => {
    const i = stack.lastIndexOf(onClose);
    if (i !== -1) stack.splice(i, 1);
    if (stack.length === 0) window.removeEventListener("keydown", onKey);
  };
}
