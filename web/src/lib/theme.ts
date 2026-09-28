// Tema sistema/claro/oscuro. `public/theme.js` pone `data-theme` antes del
// primer pintado; aquí se cambia en caliente y se sigue al sistema mientras la
// elección sea «sistema». Los tokens de color leen `[data-theme="dark"]`.

export type Theme = "system" | "light" | "dark";
export const THEME_KEY = "esencial.theme";
const CYCLE: Theme[] = ["system", "light", "dark"];

export const nextTheme = (t: Theme): Theme =>
  CYCLE[(CYCLE.indexOf(t) + 1) % CYCLE.length];

export const resolveTheme = (t: Theme, systemDark: boolean): "light" | "dark" =>
  t === "system" ? (systemDark ? "dark" : "light") : t;

export function readTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const SYSTEM_DARK = "(prefers-color-scheme: dark)";

export function applyTheme(t: Theme) {
  const systemDark = window.matchMedia?.(SYSTEM_DARK).matches ?? false;
  document.documentElement.dataset.theme = resolveTheme(t, systemDark);
  try {
    if (t === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, t);
  } catch {
    // Almacenamiento bloqueado: el tema vive solo en esta pestaña.
  }
}

/** Con «sistema», sigue los cambios del sistema en vivo. Devuelve la baja. */
export function followSystem(get: () => Theme): () => void {
  const mq = window.matchMedia?.(SYSTEM_DARK);
  if (!mq?.addEventListener) return () => {};
  const on = () => {
    if (get() === "system") applyTheme("system");
  };
  mq.addEventListener("change", on);
  return () => mq.removeEventListener("change", on);
}
