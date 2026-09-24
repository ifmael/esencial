// Halo de las tarjetas: un solo listener pasivo para toda la app escribe la
// posición del puntero (relativa a la tarjeta bajo él) en `--mx`/`--my`; el
// dibujo lo hace el CSS (`.card::before`). Solo con puntero fino.
export function installPointerHalo() {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  document.addEventListener(
    "pointermove",
    (e) => {
      const card = (e.target as Element | null)?.closest?.<HTMLElement>(
        ".card",
      );
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}
