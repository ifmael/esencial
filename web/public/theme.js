// Tema antes del primer pintado (script clásico, sin defer, en <head>): la
// página sale ya en su tema aunque el bundle tarde o no llegue. Espejo de
// `THEME_KEY` y `resolveTheme` en src/lib/theme.ts (el test los ata): si cambia
// la regla o la clave, cambian los dos.
(() => {
  let saved = null;
  try {
    saved = localStorage.getItem("esencial.theme");
  } catch {
    // almacenamiento bloqueado: manda el sistema
  }
  const chosen = saved === "light" || saved === "dark";
  const dark =
    !chosen && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = chosen
    ? saved
    : dark
      ? "dark"
      : "light";
})();
