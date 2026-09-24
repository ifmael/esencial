// Rejilla semanal compartida (Lunes→Domingo): un único contenedor con la
// navegación de semana y las siete columnas. Presentacional y sin dominio: la
// página es dueña de los datos y del contenido de cada día, que entra por el
// render prop `children` (fuerza inyecta la sesión; comidas, las 3 tomas).
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { toISODate } from "../lib/day";
import { canViewTransition, runViewTransition } from "../lib/view-transition";
import { Button, cardClass } from "./ui";

const DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

/** YYYY-MM-DD of day `dayIndex` (0=Lunes) of ISO week, UTC-math, no clock. */
function dayOf(isoWeek: string, dayIndex: number): string {
  const [yearStr, weekStr] = isoWeek.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(
    jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000,
  );
  const date = new Date(monday.getTime() + (week - 1) * 7 * 86_400_000);
  date.setUTCDate(date.getUTCDate() + dayIndex);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Columna de un día, tal como la recibe el render prop de la página. */
type WeekDay = {
  index: number;
  name: string;
  date: string;
  isToday: boolean;
};

export function WeekGrid({
  isoWeek,
  loading = false,
  busy = false,
  error = null,
  onRetry,
  onShiftWeek,
  children,
}: {
  isoWeek: string;
  loading?: boolean;
  /** Los datos de `isoWeek` aún no han llegado (se ve la semana anterior o
   * nada). La transición de semana espera a que sea false para fotografiar la
   * rejilla nueva, así que nunca anima hacia datos viejos. */
  busy?: boolean;
  error?: string | null;
  /** Acción del aviso de error; sin ella el aviso no lleva botón. */
  onRetry?: () => void;
  onShiftWeek: (delta: number) => void;
  /** Contenido de la columna de cada día (lo pone la página). */
  children: (day: WeekDay) => ReactNode;
}) {
  const today = toISODate(new Date());
  // Transición en curso: la semana de la que se sale y cómo soltar la foto.
  const pending = useRef<{ from: string; release: () => void } | null>(null);

  // Tras cada render: si la semana ya cambió y sus datos están, el navegador
  // puede tomar la foto «después» (antes de pintar: layout effect).
  useLayoutEffect(() => {
    const p = pending.current;
    if (p && p.from !== isoWeek && !busy) {
      pending.current = null;
      p.release();
    }
  });

  const shift = (delta: number) => {
    if (!canViewTransition()) {
      onShiftWeek(delta);
      return;
    }
    // El sentido del deslizamiento lo lee el CSS (`[data-week-dir]`).
    document.documentElement.dataset.weekDir = delta < 0 ? "prev" : "next";
    const from = isoWeek;
    void runViewTransition(
      () =>
        new Promise<void>((release) => {
          // Un clic encima de otro: la transición anterior la salta el
          // navegador; se suelta su espera para no dejarla colgada.
          pending.current?.release();
          pending.current = { from, release };
          onShiftWeek(delta);
        }),
    );
  };

  return (
    <section className={cardClass("flex min-h-0 flex-1 flex-col gap-3")}>
      <header className="flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          aria-label="Semana anterior"
          onClick={() => shift(-1)}
        >
          ‹
        </Button>
        <h2 className="text-title">{isoWeek}</h2>
        <Button
          variant="secondary"
          aria-label="Semana siguiente"
          onClick={() => shift(1)}
        >
          ›
        </Button>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-panel border border-error/40 p-3 text-error"
        >
          <p>{error}</p>
          {onRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              Reintentar
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="text-text-secondary">Cargando…</div>
      ) : (
        <div
          // Nombre de la transición de semana: el CSS desliza solo esta pieza.
          style={{ viewTransitionName: "week-grid" }}
          className="flex flex-col gap-3 md:grid md:min-h-0 md:flex-1 md:grid-flow-col md:auto-cols-fr md:gap-2 md:overflow-y-auto"
        >
          {DAYS.map((name, index) => {
            const date = dayOf(isoWeek, index);
            const isToday = date === today;
            return (
              <div key={name} className="flex flex-col gap-2 md:min-h-0">
                <h3
                  className={`flex items-baseline gap-2 border-b pb-1 text-lead ${
                    isToday ? "border-accent" : "border-border"
                  }`}
                >
                  {name}
                  <span className="font-sans text-caption text-text-secondary tabular-nums">
                    {Number(date.slice(8))}
                  </span>
                  {isToday ? (
                    <span className="ml-auto font-sans text-micro font-semibold uppercase tracking-widest text-accent">
                      Hoy
                    </span>
                  ) : null}
                </h3>
                {children({ index, name, date, isToday })}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
