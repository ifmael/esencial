// Tema antes del primer pintado (script clásico, sin defer, en <head>): evita
// el destello claro al abrir en oscuro. Espejo de `effectiveTheme` y
// `THEME_KEY` en src/lib/ambient.ts, que lo vuelve a aplicar al arrancar; si
// cambia la regla o la clave, cambian los dos.
(() => {
  try {
    const saved = localStorage.getItem("esencial.theme");
    const valid = saved === "light" || saved === "dark";
    // El sistema solo se consulta sin elección guardada: la elección no puede
    // depender de que exista matchMedia.
    const dark = !valid && matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = valid
      ? saved
      : dark
        ? "dark"
        : "light";
  } catch {
    // almacenamiento bloqueado: ambient.ts decide al arrancar
  }
})();
