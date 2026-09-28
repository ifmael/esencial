// Gesto de la hoja inferior M3: el asa arrastra la hoja; al soltar decide si
// cierra o vuelve. Puro para probarlo solo (components/sheet.tsx lo usa).

/** Desplazamiento visible para un arrastre de `dy` px: abajo, 1:1; arriba,
 * con resistencia (la hoja ya está en su tope). */
export const sheetDrag = (dy: number) =>
  dy >= 0 ? dy : -24 * (1 - Math.exp(dy / 80));

/** Cierra si bajó más de un tercio de su alto o se soltó con un tirón hacia
 * abajo (> 0,5 px/ms); si no, vuelve a su sitio con el muelle. */
export function sheetRelease({
  dy,
  velocity,
  height,
}: {
  dy: number;
  velocity: number;
  height: number;
}): "close" | "settle" {
  if (dy <= 0) return "settle";
  return dy > height / 3 || velocity > 0.5 ? "close" : "settle";
}
