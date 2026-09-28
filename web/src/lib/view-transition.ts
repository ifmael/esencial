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
 * se espera a que React pinte el estado nuevo. Resuelve cuando el DOM nuevo ya
 * está puesto (no espera a que acabe la animación).
 */
export async function runViewTransition(
  update: () => void | Promise<void>,
): Promise<void> {
  if (!canViewTransition()) {
    await update();
    return;
  }
  // Una transición abortada (otra que empieza encima) no es un error del cambio.
  await document.startViewTransition(update).updateCallbackDone.catch(() => {});
}
