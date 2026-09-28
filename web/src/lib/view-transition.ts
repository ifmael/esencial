import { type CSSProperties, useLayoutEffect, useState } from "react";

// View Transitions API nativa (0 KB): el navegador fotografía la página, corre
// el cambio y anima entre las dos fotos. Sin la API, o con movimiento
// reducido, el cambio se aplica directo: la transición es un adorno, nunca una
// condición para que la app funcione.

/** true si hay API y el usuario no pidió menos movimiento. */
export function canViewTransition(): boolean {
  // `in`: los tipos del DOM la dan por existente, los navegadores viejos no.
  if (!("startViewTransition" in document)) return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Corre `update` dentro de una transición de vista si se puede. `update` puede
 * devolver una promesa: la foto «después» se toma cuando resuelve, así que ahí
 * se espera a que React pinte el estado nuevo. Resuelve cuando la animación
 * acaba (`finished`).
 */
export async function runViewTransition(
  update: () => void | Promise<void>,
): Promise<void> {
  if (!canViewTransition()) {
    await update();
    return;
  }
  // Una transición abortada (otra que empieza encima) no es un error del cambio.
  // Se espera a `finished`: mientras dura, la capa de la transición tapa la
  // página y se queda con el puntero, así que quien llama sabe cuándo ya se
  // puede interactuar (y soltar los nombres de transición).
  const vt = document.startViewTransition(update);
  await vt.updateCallbackDone.catch(() => {});
  await vt.finished.catch(() => {});
}

/** Nombre de la transformación de contenedor «crear»: lo pulsado crece hasta
 * lo que abre. Un nombre por foto: dos iguales anulan la transición. */
export const CREATE_MORPH = "create";
let source: HTMLElement | null = null;

/** Lo pulsado (FAB, «Nueva …») toma el nombre para la foto «antes». Llamar
 * justo antes de navegar o de abrir, dentro de `onClick`. */
export function morphFrom(el: HTMLElement): void {
  if (!canViewTransition()) return;
  source?.style.removeProperty("view-transition-name");
  source = el;
  el.style.viewTransitionName = CREATE_MORPH;
  // Sin destino que lo reclame (navegación cancelada), caduca: si no, la próxima
  // carga de un destino crecería desde un botón viejo.
  setTimeout(() => {
    if (source !== el) return;
    el.style.removeProperty("view-transition-name");
    source = null;
  }, 1000);
}

/** Tests: olvida lo pulsado para que no se filtre de un test a otro. */
export function resetMorph(): void {
  source?.style.removeProperty("view-transition-name");
  source = null;
}

/** Estilo del destino de crear. Solo hay morph si se llegó con `morphFrom`
 * (carga directa, editar o sin API: nada). Al montarse le quita el nombre a lo
 * pulsado, y su animación de entrada propia se apaga: la hace la transición. */
export function useCreateMorph(enabled = true): CSSProperties | undefined {
  const [on] = useState(() => enabled && source !== null);
  useLayoutEffect(() => {
    if (!on) return;
    source?.style.removeProperty("view-transition-name");
    source = null;
  }, [on]);
  return on
    ? { viewTransitionName: CREATE_MORPH, animation: "none" }
    : undefined;
}
