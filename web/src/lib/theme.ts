// Tema claro/oscuro. Sin elección manda `prefers-color-scheme` (los tokens son
// `light-dark()`); la elección fija `data-theme` en <html> y se recuerda.

export type Theme = "system" | "light" | "dark";

const KEY = "esencial.theme";
const CYCLE: Theme[] = ["system", "light", "dark"];

export const nextTheme = (t: Theme): Theme =>
  CYCLE[(CYCLE.indexOf(t) + 1) % CYCLE.length];

export function readTheme(): Theme {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
  try {
    if (t === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, t);
  } catch {
    // Almacenamiento bloqueado: el tema vive solo en esta pestaña.
  }
}
