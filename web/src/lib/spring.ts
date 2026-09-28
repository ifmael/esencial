// Muelles M3E (esquema *expressive*) pasados a CSS. CSS no tiene muelles, así
// que la curva se resuelve aquí de forma analítica (masa 1, ω = √rigidez) y se
// muestrea en un `linear()`; su duración es la de asentarse. `scripts/
// gen-tokens.ts` escribe el resultado en `globals.css`: en tiempo de ejecución
// no se calcula nada.

export type Spring = { stiffness: number; dampingRatio: number };

/** Los seis muelles de `MotionScheme.expressive()` de Material 3 (Compose):
 * espaciales (posición, tamaño, forma: ζ < 1, rebotan) y de efectos (color,
 * opacidad: ζ = 1, sin rebote), cada uno en rápido, por defecto y lento. */
export const SPRINGS = {
  "spatial-fast": { stiffness: 800, dampingRatio: 0.6 },
  "spatial-default": { stiffness: 380, dampingRatio: 0.8 },
  "spatial-slow": { stiffness: 200, dampingRatio: 0.8 },
  "effects-fast": { stiffness: 3800, dampingRatio: 1 },
  "effects-default": { stiffness: 1600, dampingRatio: 1 },
  "effects-slow": { stiffness: 800, dampingRatio: 1 },
} satisfies Record<string, Spring>;

/** Desplazamiento de 0 a 1 en el instante `t` (s), partiendo del reposo. */
function position({ stiffness, dampingRatio: z }: Spring, t: number): number {
  const w = Math.sqrt(stiffness);
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return (
      1 -
      Math.exp(-z * w * t) *
        (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t))
    );
  }
  // Crítico (el único ζ ≥ 1 que usa el esquema).
  return 1 - Math.exp(-w * t) * (1 + w * t);
}

/** Muestras de la curva y cuánto tarda en quedarse a menos de 0,1 % de su
 * destino (y no volver a salir). */
export function springCurve(
  spring: Spring,
  samples = 40,
): { points: number[]; durationMs: number } {
  const step = 1 / 1000;
  let settle = 0;
  for (let t = 0; t < 5; t += step)
    if (Math.abs(1 - position(spring, t)) > 0.001) settle = t + step;
  const points = Array.from({ length: samples + 1 }, (_, i) =>
    i === 0 ? 0 : i === samples ? 1 : position(spring, (settle * i) / samples),
  );
  return { points, durationMs: Math.round(settle * 1000) };
}

export const toLinear = (points: number[]) =>
  `linear(${points.map((p) => Number(p.toFixed(3))).join(", ")})`;
