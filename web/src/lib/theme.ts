// Tema sistema/claro/oscuro. `public/theme.js` pone `data-theme` antes del
// primer pintado; aquí se cambia en caliente y se sigue al sistema mientras la
// elección sea «sistema». Los tokens de color leen `[data-theme="dark"]`.
// Se elige en Ajustes (`/ajustes`) y con «Cambiar tema» de la paleta ⌘K;
// `useTheme` mantiene a los dos al día.
import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";
export const THEMES: Theme[] = ["system", "light", "dark"];
export const THEME_NAME: Record<Theme, string> = {
  system: "Sistema",
  light: "Claro",
  dark: "Oscuro",
};
export const THEME_KEY = "esencial.theme";

export const nextTheme = (t: Theme): Theme =>
  THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];

export const resolveTheme = (
  t: Theme,
  systemDark: boolean,
): "light" | "dark" => (t === "system" ? (systemDark ? "dark" : "light") : t);

export function readTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const SYSTEM_DARK = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

export function applyTheme(t: Theme) {
  const systemDark = window.matchMedia?.(SYSTEM_DARK).matches ?? false;
  document.documentElement.dataset.theme = resolveTheme(t, systemDark);
  try {
    if (t === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, t);
  } catch {
    // Almacenamiento bloqueado: el tema vive solo en esta pestaña.
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Tema elegido, vivo: se re-renderiza al cambiarlo desde cualquier sitio.
 * ponytail: la foto es localStorage; con el almacenamiento bloqueado se ve
 * «sistema» aunque el tema aplicado sea otro. */
export const useTheme = (): Theme =>
  useSyncExternalStore(subscribe, readTheme, () => "system");

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
