// Consultas de medios como estado de React. Solo para lo que no se puede
// resolver con CSS: mover un bloque de sitio según el ancho (no ocultarlo).
import { useEffect, useState } from "react";

/** El corte de escritorio es el `lg` de Tailwind, el mismo que usan las clases
 *  del layout (la rejilla de dos columnas). */
export const DESKTOP_QUERY = "(min-width: 64rem)";

/** ¿La ventana está en escritorio? Se lee en el primer render (la SPA no tiene
 *  SSR), así que no hay salto de layout al cargar. Sin `matchMedia` (jsdom)
 *  dice que no, así que las pruebas ven el layout de móvil. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof matchMedia === "function" && matchMedia(DESKTOP_QUERY).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(DESKTOP_QUERY);
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return desktop;
}
