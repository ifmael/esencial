// Datos visibles (dirección C): cifras que cuentan al aparecer y anillos de
// progreso. SVG + CSS, sin librería: el arco lo anima `.progress-ring-arc`
// (globals.css) y la cifra, un bucle de `requestAnimationFrame` corto.
// Con `prefers-reduced-motion` la cifra final está ahí desde el primer render y
// la regla global neutraliza el arco.
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/** Duración del recuento; la misma que `--duration-count`. */
const COUNT_MS = 900;

/** Valor mostrado en el instante `t` ∈ [0,1]: ease-out-quart, entero, sin
 *  pasarse del objetivo. */
export function countUpValue(target: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return Math.round(target * (1 - (1 - k) ** 4));
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Cifra que cuenta desde 0 al aparecer y, si cambia, desde la que se veía
 *  (marcar una serie no la hace volver a 0). El lector de pantalla oye solo el
 *  valor final (con su `label`), nunca los intermedios. */
export function CountUp({
  value,
  label,
  className,
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const [shown, setShown] = useState(() =>
    prefersReducedMotion() ? value : 0,
  );
  // Último valor pintado: el punto de partida del siguiente recuento.
  const from = useRef(shown);

  useEffect(() => {
    if (prefersReducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const origin = from.current;
    const start = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const t = (now - start) / COUNT_MS;
      const next = origin + countUpValue(value - origin, t);
      from.current = next;
      setShown(next);
      if (t < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value]);

  return (
    <span className={className}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{label ? `${value} ${label}` : value}</span>
    </span>
  );
}

/** Anillo de progreso con la cifra dentro (por defecto «valor/max»). */
export function ProgressRing({
  value,
  max,
  label,
  size = 96,
  tone = "primary",
  children,
}: {
  value: number;
  max: number;
  label: string;
  size?: number;
  tone?: "primary" | "secondary";
  children?: ReactNode;
}) {
  const now = max > 0 ? Math.min(max, Math.max(0, value)) : 0;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const offset = max > 0 ? length * (1 - now / max) : length;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          className="progress-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="progress-ring-arc"
          data-tone={tone}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={length}
          strokeDashoffset={offset}
          style={{ "--ring-length": length } as CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children ?? (
          <span className="metric text-title">
            <CountUp value={now} />
            <span className="text-text-secondary">/{max}</span>
          </span>
        )}
      </div>
    </div>
  );
}
