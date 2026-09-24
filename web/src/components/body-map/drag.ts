// Gesto del mapa 3D: un toque elige el músculo y un arrastre gira la figura.
// La captura del puntero se pide SOLO al pasar el umbral: pedirla en
// `pointerdown` desvía el `click` del lienzo y el toque no elegiría nada.

/** Píxeles de desplazamiento a partir de los cuales un toque es un arrastre. */
const THRESHOLD = 3;

export type DragState = { x: number; moved: boolean };

/** Un `pointermove`: nuevo estado, cuánto girar (`dx`) y si hay que capturar. */
export function dragStep(
  state: DragState,
  clientX: number,
): { state: DragState; dx: number; capture: boolean } {
  const dx = clientX - state.x;
  if (!state.moved && Math.abs(dx) <= THRESHOLD)
    return { state, dx: 0, capture: false };
  return {
    state: { x: clientX, moved: true },
    dx,
    capture: !state.moved,
  };
}
