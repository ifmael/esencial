// Piezas expresivas M3E: formas abstractas (con morph), indicador de carga,
// progreso ondulado (lineal y circular), sello de recompensa y cifras que
// cuentan. SVG + CSS, sin librería. Todo el movimiento se apaga con
// `prefers-reduced-motion` (globals.css).
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type ShapeName, shapePath } from "../lib/shapes";
import { EFFORT_SHAPES, formatShortDate } from "../lib/workout";
import { cx } from "./ui";

/** Esfuerzo percibido en lectura (1–5): las mismas formas del selector de la
 *  sesión, en pequeño. Se anuncia como una sola imagen («Esfuerzo 4 de 5»), así
 *  que las formas van ocultas al lector. */
export function EffortScale({
  effort,
  size = 18,
  className,
}: {
  effort: number;
  size?: number;
  className?: string;
}) {
  const label = `Esfuerzo ${effort} de ${EFFORT_SHAPES.length}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cx("flex shrink-0 items-center gap-0.5", className)}
    >
      {EFFORT_SHAPES.map((shape, i) => {
        const filled = i < effort;
        return (
          <Shape
            key={shape}
            name={filled ? shape : "circle"}
            size={filled ? size : size - 6}
            className={filled ? "text-accent" : "text-outline-variant"}
          />
        );
      })}
    </span>
  );
}

/** Progresión: una barra por sesión, con el valor más alto de cada día. La
 *  altura es relativa al mínimo y al máximo de lo cargado — si no, 57,5 y
 *  60 kg se verían iguales — y el nombre accesible lleva el resumen; cada barra
 *  dice su valor al pasar el ratón. */
export function ProgressChart({
  points,
  unit,
  label,
  className,
}: {
  points: readonly { date: string; value: number }[];
  /** Lo que miden las barras («kg», «reps», «km»), para el `title` de cada una. */
  unit: string;
  /** Qué se anuncia: «Progresión de Press banca: de 45 a 60 kg en 25 sesiones». */
  label: string;
  className?: string;
}) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <div
        role="img"
        aria-label={label}
        className="flex h-24 items-end gap-0.5 border-b border-outline-variant"
      >
        {points.map((point) => (
          <span
            key={point.date}
            title={`${formatShortDate(point.date)}: ${point.value} ${unit}`}
            // Sin datos planos: una sola sesión (o todas iguales) pinta a media
            // altura, que es lo honesto si no hay tendencia que enseñar.
            style={{
              height: `${
                span === 0 ? 60 : 34 + (66 * (point.value - min)) / span
              }%`,
            }}
            className="min-w-0 flex-1 rounded-t-s bg-accent"
          />
        ))}
      </div>
      {points.length > 1 && (
        <div className="flex justify-between text-label-s text-on-surface-variant">
          <span>{formatShortDate(first.date)}</span>
          <span>{formatShortDate(last.date)}</span>
        </div>
      )}
    </div>
  );
}

/** Forma M3E rellena de `currentColor`. Cambiar `name` la transforma (el `d`
 * se anima por CSS: mismas coordenadas en todas las formas). */
export function Shape({
  name,
  size = 48,
  className,
  children,
  label,
}: {
  name: ShapeName;
  size?: number;
  className?: string;
  children?: ReactNode;
  /** Sin `label` es decorativa. */
  label?: string;
}) {
  return (
    <span
      className={cx(
        // `relative` solo si el consumidor no la posiciona: con las dos clases
        // gana la que Tailwind emite después y `absolute` se perdía.
        !/\b(absolute|fixed|sticky)\b/.test(className ?? "") && "relative",
        "inline-grid shrink-0 place-items-center",
        className,
      )}
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="shape absolute inset-0"
        aria-hidden="true"
      >
        <path d={shapePath(name)} fill="currentColor" />
      </svg>
      {children ? <span className="relative">{children}</span> : null}
    </span>
  );
}

const LOADER_SEQUENCE: ShapeName[] = [
  "cookie-9",
  "pill",
  "sunny",
  "cookie-4",
  "soft-diamond",
  "flower",
];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Indicador de carga M3E: una forma que gira y se transforma en la
 * siguiente. Sustituye a «Cargando…» (el texto queda para el lector). */
export function Loader({
  label = "Cargando…",
  size = 48,
  className,
}: {
  label?: string;
  size?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(
      () => setI((n) => (n + 1) % LOADER_SEQUENCE.length),
      650,
    );
    return () => clearInterval(id);
  }, [reduced]);
  return (
    <div
      role="status"
      className={cx(
        "flex items-center justify-center gap-3 py-6 text-accent",
        className,
      )}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="loader shape-spin"
        aria-hidden="true"
      >
        <path d={shapePath(LOADER_SEQUENCE[i])} fill="currentColor" />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Onda senoidal de `width` px como trazo SVG (para el progreso ondulado). */
function wavePath(
  width: number,
  amplitude: number,
  wavelength: number,
  y: number,
): string {
  const pts: string[] = [];
  for (let x = 0; x <= width; x += 2) {
    pts.push(
      `${x} ${(y + amplitude * Math.sin((x / wavelength) * 2 * Math.PI)).toFixed(2)}`,
    );
  }
  return `M${pts.join("L")}`;
}

/** Progreso ondulado lineal (M3E): la parte hecha ondula, la pendiente es
 * una pista recta. `label` nombra la barra para el lector. */
export function WavyProgress({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const now = Math.max(0, Math.min(max, value));
  const pct = max > 0 ? (now / max) * 100 : 0;
  const W = 240;
  const H = 12;
  const wavelength = 24;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      className={cx(
        "relative h-3 w-full overflow-hidden text-accent",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {/* Pista pendiente: recta y a la derecha, con un hueco de 4 px. */}
        <line
          x1={0}
          x2={W}
          y1={H / 2}
          y2={H / 2}
          stroke="var(--color-accent-container)"
          strokeWidth={4}
          strokeLinecap="round"
        />
        <clipPath id={`wavy-${label.replace(/\W/g, "")}`}>
          <rect x={0} y={0} width={(W * pct) / 100} height={H} />
        </clipPath>
        <g clipPath={`url(#wavy-${label.replace(/\W/g, "")})`}>
          <rect
            x={0}
            y={0}
            width={(W * pct) / 100}
            height={H}
            fill="var(--color-surface-container-high)"
            className="transition-[width] motion-spatial-slow"
          />
          <path
            className="wavy-track"
            style={{ ["--wave-length" as string]: `-${wavelength}px` }}
            d={wavePath(W + wavelength, 2.5, wavelength, H / 2)}
            fill="none"
            stroke="currentColor"
            strokeWidth={4}
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
}

/** Progreso circular ondulado: el borde hecho ondula alrededor de la cifra. */
export function WavyRing({
  value,
  max,
  label,
  className = "size-28",
  children,
}: {
  value: number;
  max: number;
  label: string;
  /** Tamaño por clases (`size-24 lg:size-28`): así puede cambiar por breakpoint. */
  className?: string;
  children?: ReactNode;
}) {
  const now = Math.max(0, Math.min(max, value));
  const frac = max > 0 ? now / max : 0;
  const c = 50;
  const r = 40;
  const waves = 12;
  const amp = 2.2;
  // Onda polar cerrada; su longitud aproximada da el dasharray.
  const pts: [number, number][] = [];
  for (let i = 0; i <= 360; i++) {
    const t = (i / 360) * 2 * Math.PI - Math.PI / 2;
    const rr = r + amp * Math.sin(waves * t);
    pts.push([c + rr * Math.cos(t), c + rr * Math.sin(t)]);
  }
  let length = 0;
  for (let i = 1; i < pts.length; i++)
    length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const d = `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}`;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      className={cx(
        "relative inline-grid shrink-0 place-items-center text-accent",
        className,
      )}
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="var(--color-accent-container)"
          strokeWidth={6}
        />
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - frac)}
          className="wavy-fill"
          opacity={frac === 0 ? 0 : 1}
        />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

const COUNT_MS = 900;

/** Valor en el instante `t` ∈ [0,1] del recuento (ease-out-quart, entero). */
export function countUpValue(target: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return Math.round(target * (1 - (1 - k) ** 4));
}

/** Cifra que cuenta hasta `value`; el lector oye solo el valor final. */
export function CountUp({
  value,
  label,
  className,
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (reduced) {
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
  }, [value, reduced]);
  return (
    <span className={cx("tabular", className)}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{label ? `${value} ${label}` : value}</span>
    </span>
  );
}

/** Sello de recompensa: galleta de 12 lados (sol) que entra con el muelle
 * espacial lento, con la cifra de series dentro. Sin confeti. */
export function RewardSeal({
  sets,
  title = "¡Sesión completa!",
}: {
  sets: number;
  title?: string;
}) {
  return (
    <div
      role="status"
      className="seal flex items-center gap-4 rounded-xl bg-primary-container p-4 text-on-primary-container"
    >
      <span className="relative grid size-24 shrink-0 place-items-center text-primary">
        <svg
          viewBox="0 0 100 100"
          className="seal-shape absolute inset-0 size-24"
          aria-hidden="true"
        >
          <path d={shapePath("sunny")} fill="currentColor" />
        </svg>
        <span className="relative flex flex-col items-center text-on-primary">
          <CountUp
            value={sets}
            className="text-headline-m text-e leading-none"
          />
          <span className="text-label-s">series</span>
        </span>
      </span>
      <span className="flex flex-col">
        <span className="text-title-l text-e">{title}</span>
        <span className="text-body-m">Todo marcado. Buen trabajo.</span>
      </span>
    </div>
  );
}

/** Composición de formas para los estados vacíos: tres formas del color de la
 * sección, superpuestas, y el texto claro al lado. */
export function EmptyState({
  title,
  children,
  shapes = ["cookie-9", "pill", "flower"],
  className,
}: {
  title: string;
  children?: ReactNode;
  shapes?: [ShapeName, ShapeName, ShapeName];
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-4 px-4 py-8 text-center",
        className,
      )}
    >
      <span className="relative block h-24 w-32" aria-hidden="true">
        <Shape
          name={shapes[0]}
          size={72}
          className="absolute left-0 top-2 text-accent-container"
        />
        <Shape
          name={shapes[1]}
          size={48}
          className="absolute right-2 top-0 rotate-12 text-accent"
        />
        <Shape
          name={shapes[2]}
          size={40}
          className="absolute bottom-0 right-8 text-surface-container-highest"
        />
      </span>
      <p className="text-title-m">{title}</p>
      {children}
    </div>
  );
}

const THUMB_SHAPES: ShapeName[] = [
  "cookie-7",
  "clover",
  "soft-diamond",
  "flower",
  "cookie-4",
  "sunny",
  "cookie-12",
  "pill",
];

/** Miniatura sin foto: una forma M3E estable por nombre, con la inicial. */
export function Monogram({
  name,
  size = 56,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const shape = THUMB_SHAPES[h % THUMB_SHAPES.length];
  return (
    <Shape
      name={shape}
      size={size}
      className={cx("text-accent-container", className)}
    >
      <span
        className="text-title-l text-e text-on-accent-container"
        style={{ fontSize: size * 0.4 }}
      >
        {name.trim().charAt(0).toUpperCase()}
      </span>
    </Shape>
  );
}
