// Formas abstractas de Material 3 Expressive (galletas, trébol, sol, flor,
// diamante suave, píldora…) como curvas polares r(θ). Se muestrean SIEMPRE en
// los mismos ángulos: dos formas cualesquiera tienen los mismos puntos en el
// mismo orden, así que el cambio de forma (morph) es interpolar `d`.
// Cero dependencias; el SVG lo pinta `components/shape.tsx`.

const POINTS = 120;

/** Superelipse |x/a|^p + |y/b|^p = 1 en polar. */
const superellipse = (p: number, a = 1, b = 1) => (t: number) =>
  (Math.abs(Math.cos(t) / a) ** p + Math.abs(Math.sin(t) / b) ** p) ** (-1 / p);

/** Galleta: n festones redondos de profundidad `depth`. */
const cookie = (n: number, depth: number) => (t: number) =>
  1 - depth * (1 - Math.cos(n * t)) * 0.5;

/** Pétalos: lóbulos redondos con el valle pellizcado. */
const petals = (n: number, base: number, sharp: number) => (t: number) =>
  base + (1 - base) * Math.abs(Math.cos((n * t) / 2)) ** sharp;

export const SHAPES = {
  circle: () => 1,
  square: superellipse(5),
  "soft-diamond": superellipse(1.35),
  pill: superellipse(2.8, 1, 0.62),
  "cookie-4": cookie(4, 0.14),
  "cookie-7": cookie(7, 0.12),
  "cookie-9": cookie(9, 0.1),
  "cookie-12": cookie(12, 0.08),
  sunny: cookie(8, 0.16),
  clover: petals(4, 0.52, 0.7),
  flower: petals(8, 0.74, 0.8),
} satisfies Record<string, (t: number) => number>;

export type ShapeName = keyof typeof SHAPES;

/** Puntos de la forma en la caja unidad, centrada y tocando sus bordes. */
export function shapePoints(name: ShapeName): [number, number][] {
  const r = SHAPES[name];
  // -π/2: el primer punto arriba, para que las formas de lóbulo impar queden
  // con un lóbulo apuntando hacia arriba.
  const raw = Array.from({ length: POINTS }, (_, i) => {
    const t = (i / POINTS) * 2 * Math.PI - Math.PI / 2;
    const rad = r(t);
    return [rad * Math.cos(t), rad * Math.sin(t)] as const;
  });
  const xs = raw.map(([x]) => x);
  const ys = raw.map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY);
  const ox = (span - (maxX - minX)) / 2 - minX;
  const oy = (span - (maxY - minY)) / 2 - minY;
  return raw.map(([x, y]) => [(x + ox) / span, (y + oy) / span]);
}

/** Trazo SVG cerrado de la forma en una caja de `size`×`size`. */
export function shapePath(name: ShapeName, size = 100): string {
  const pts = shapePoints(name).map(
    ([x, y]) => `${Number((x * size).toFixed(2))} ${Number((y * size).toFixed(2))}`,
  );
  return `M${pts.join("L")}Z`;
}
