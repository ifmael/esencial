// Ambiente de la dirección «cristal»: tema claro/oscuro, pausa de la aurora con
// la pestaña oculta e inclinación 3D de las tarjetas pulsables. Todo lo visual
// vive en `globals.css`; aquí solo se ponen atributos y variables en el DOM.

export type Theme = "light" | "dark";
export const THEME_KEY = "esencial.theme";

/** La elección guardada manda; sin ella (o con basura), el sistema. */
export function effectiveTheme(
  saved: string | null,
  systemDark: boolean,
): Theme {
  if (saved === "light" || saved === "dark") return saved;
  return systemDark ? "dark" : "light";
}

function readSaved(): string | null {
  try {
    return window.localStorage.getItem(THEME_KEY);
  } catch {
    return null; // almacenamiento bloqueado: manda el sistema
  }
}

export function currentTheme(): Theme {
  const systemDark =
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  return effectiveTheme(readSaved(), systemDark);
}

export function saveTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* sin almacenamiento: vale para esta visita */
  }
}

type Rect = { left: number; top: number; width: number; height: number };

/** Grados de inclinación (rotateX, rotateY) para un puntero en (px, py): cero en
 * el centro, `max` en los bordes, y la tarjeta se inclina hacia el puntero. */
export function tiltFor(rect: Rect, px: number, py: number, max: number) {
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  const nx = clamp(((px - rect.left) / rect.width) * 2 - 1);
  const ny = clamp(((py - rect.top) / rect.height) * 2 - 1);
  return { x: -ny * max || 0, y: nx * max || 0 };
}

const TILT_MAX = 5;
const TILT_SELECTOR = ".card-interactive";

/** Aplica el tema, pausa la aurora con la pestaña oculta y, solo con puntero
 * fino y sin reduced-motion, inclina las tarjetas pulsables. Devuelve la baja. */
export function installAmbient(): () => void {
  const root = document.documentElement;
  root.dataset.theme = currentTheme();

  const onVisibility = () => {
    if (document.hidden) root.dataset.hidden = "";
    else delete root.dataset.hidden;
  };
  document.addEventListener("visibilitychange", onVisibility);

  const canTilt =
    window.matchMedia?.(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    ).matches ?? false;
  let tilted: HTMLElement | null = null;
  const reset = () => {
    tilted?.style.removeProperty("--tilt-x");
    tilted?.style.removeProperty("--tilt-y");
    tilted = null;
  };
  const onMove = (e: PointerEvent) => {
    const card = (e.target as Element | null)?.closest?.<HTMLElement>(
      TILT_SELECTOR,
    );
    if (card !== tilted) reset();
    if (!card) return;
    tilted = card;
    const t = tiltFor(
      card.getBoundingClientRect(),
      e.clientX,
      e.clientY,
      TILT_MAX,
    );
    card.style.setProperty("--tilt-x", `${t.x.toFixed(2)}deg`);
    card.style.setProperty("--tilt-y", `${t.y.toFixed(2)}deg`);
  };
  if (canTilt) {
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", reset);
  }

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", reset);
    reset();
  };
}
