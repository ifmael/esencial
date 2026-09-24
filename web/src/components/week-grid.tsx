// Rejilla semanal compartida (Lunes→Domingo): un único contenedor con la
// navegación de semana y las siete columnas. Presentacional y sin dominio: la
// página es dueña de los datos y del contenido de cada día, que entra por el
// render prop `children` (fuerza inyecta la sesión; comidas, las 3 tomas).
import type { ReactNode } from "react";
import { toISODate } from "../lib/day";
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
  error = null,
  onRetry,
  onShiftWeek,
  aside,
  children,
}: {
  isoWeek: string;
  loading?: boolean;
  error?: string | null;
  /** Acción del aviso de error; sin ella el aviso no lleva botón. */
  onRetry?: () => void;
  onShiftWeek: (delta: number) => void;
  /** Pieza opcional junto al título de la semana (p. ej. la racha). */
  aside?: ReactNode;
  /** Contenido de la columna de cada día (lo pone la página). */
  children: (day: WeekDay) => ReactNode;
}) {
  const today = toISODate(new Date());

  return (
    <section className={cardClass("flex min-h-0 flex-1 flex-col gap-3")}>
      <header className="flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          aria-label="Semana anterior"
          onClick={() => onShiftWeek(-1)}
        >
          ‹
        </Button>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <h2 className="text-title">{isoWeek}</h2>
          {aside}
        </div>
        <Button
          variant="secondary"
          aria-label="Semana siguiente"
          onClick={() => onShiftWeek(1)}
        >
          ›
        </Button>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-panel border border-error p-3 text-error"
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
        <div className="flex flex-col gap-3 md:grid md:min-h-0 md:flex-1 md:grid-flow-col md:auto-cols-fr md:gap-2 md:overflow-y-auto">
          {DAYS.map((name, index) => {
            const date = dayOf(isoWeek, index);
            const isToday = date === today;
            return (
              <div key={name} className="flex flex-col gap-2 md:min-h-0">
                <h3
                  className={`flex items-center justify-between gap-1 rounded-control border px-2 py-1 text-caption font-extrabold ${
                    isToday ? "bg-primary-fill shadow-control" : "bg-surface"
                  }`}
                >
                  {name}
                  {isToday ? (
                    <span className="rounded-chip bg-ink px-1.5 text-micro text-surface">
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
