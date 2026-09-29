// Rejilla semanal compartida (Lunes→Domingo): un único contenedor con la
// navegación de semana y las siete columnas. Presentacional y sin dominio: la
// página es dueña de los datos y del contenido de cada día, que entra por el
// render prop `children` (fuerza inyecta la sesión; comidas, las 3 tomas).
//
// M3E: el cambio de semana es una transición de eje compartido (View
// Transitions; la de salida y la de entrada se deslizan en el sentido del
// cambio) y el día de hoy lleva su número dentro de una galleta de 9 lados.
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { toISODate } from "../lib/day";
import { canViewTransition, runViewTransition } from "../lib/view-transition";
import { Loader, Shape } from "./expressive";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { Alert, Button, ConnectedGroup, cardClass, cx } from "./ui";

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

/** Techo de espera de la foto «después» al cambiar de semana. */
const WEEK_TRANSITION_MAX_WAIT_MS = 400;

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sept",
  "oct",
  "nov",
  "dic",
];

export function WeekGrid({
  isoWeek,
  loading = false,
  busy = false,
  error = null,
  onRetry,
  onShiftWeek,
  aside,
  children,
}: {
  isoWeek: string;
  loading?: boolean;
  /** Los datos de `isoWeek` aún no han llegado. La transición de semana
   * espera a que sea false para fotografiar la rejilla nueva. */
  busy?: boolean;
  error?: string | null;
  /** Acción del aviso de error; sin ella el aviso no lleva botón. */
  onRetry?: () => void;
  onShiftWeek: (delta: number) => void;
  /** Contenido a la derecha de la cabecera (progreso de la semana, racha). */
  aside?: ReactNode;
  /** Contenido de la columna de cada día (lo pone la página). */
  children: (day: WeekDay) => ReactNode;
}) {
  const today = toISODate(new Date());
  const pending = useRef<{ from: string; release: () => void } | null>(null);
  const grid = useRef<HTMLDivElement>(null);

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
    // El nombre de la transición se pone solo aquí y se quita al acabar: si la
    // rejilla lo llevara siempre, cualquier otra transición de la página —abrir
    // el editor del día— la convertiría en una capa propia, que el navegador
    // pinta por encima del velo y del modal: el calendario se colaría sobre el
    // modal (que aún está creciendo) y la rejilla deslizaría sin cambiar de
    // semana.
    const el = grid.current;
    el?.style.setProperty("view-transition-name", "week-grid");
    document.documentElement.dataset.weekDir = delta < 0 ? "prev" : "next";
    const from = isoWeek;
    void runViewTransition(
      () =>
        new Promise<void>((release) => {
          pending.current?.release();
          pending.current = { from, release };
          setTimeout(release, WEEK_TRANSITION_MAX_WAIT_MS);
          onShiftWeek(delta);
        }),
    ).finally(() => el?.style.removeProperty("view-transition-name"));
  };

  const first = dayOf(isoWeek, 0);
  const last = dayOf(isoWeek, 6);
  const range = `${Number(first.slice(8))} ${MONTHS[Number(first.slice(5, 7)) - 1]} – ${Number(last.slice(8))} ${MONTHS[Number(last.slice(5, 7)) - 1]}`;

  return (
    <section
      className={cardClass(
        "tonal",
        "flex min-h-0 flex-1 flex-col gap-3 rounded-xl p-3 md:p-4",
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <ConnectedGroup label="Cambiar de semana">
          <Button
            variant="tonal"
            size="icon"
            aria-label="Semana anterior"
            onClick={() => shift(-1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="tonal"
            size="icon"
            aria-label="Semana siguiente"
            onClick={() => shift(1)}
          >
            <ChevronRightIcon />
          </Button>
        </ConnectedGroup>
        <div className="flex min-w-0 flex-col px-2">
          <h2 className="text-title-l text-e tabular">{isoWeek}</h2>
          <span className="text-body-s text-on-surface-variant">{range}</span>
        </div>
        {aside ? (
          <div className="ml-auto flex items-center gap-3">{aside}</div>
        ) : null}
      </header>

      {error ? (
        <Alert>
          <p>{error}</p>
          {onRetry ? (
            <Button variant="outlined" onClick={onRetry}>
              Reintentar
            </Button>
          ) : null}
        </Alert>
      ) : null}

      {loading ? (
        <Loader label="Cargando semana…" />
      ) : (
        <div
          ref={grid}
          className="stagger flex flex-col gap-3 md:grid md:min-h-0 md:flex-1 md:grid-flow-col md:auto-cols-fr md:gap-2 md:overflow-y-auto"
        >
          {DAYS.map((name, index) => {
            const date = dayOf(isoWeek, index);
            const isToday = date === today;
            return (
              <div
                key={name}
                style={{ ["--i" as string]: index }}
                className={cx(
                  "flex flex-col gap-2 rounded-l p-2 md:min-h-0",
                  // Hoy: tono de su sección y esquina asimétrica, además de su
                  // número dentro de la galleta.
                  isToday
                    ? "rounded-tr-xl-inc bg-accent-container/40"
                    : "bg-surface-container-low",
                )}
              >
                <h3 className="flex items-center gap-2">
                  {isToday ? (
                    <Shape
                      name="cookie-9"
                      size={36}
                      className="text-accent"
                      label={`Hoy, ${Number(date.slice(8))}`}
                    >
                      <span className="text-title-s text-e tabular text-on-accent">
                        {Number(date.slice(8))}
                      </span>
                    </Shape>
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center text-title-s tabular text-on-surface-variant">
                      {Number(date.slice(8))}
                    </span>
                  )}
                  <span
                    className={cx(
                      "truncate text-title-s",
                      isToday && "text-e text-accent",
                    )}
                  >
                    {name}
                  </span>
                  {isToday ? <span className="sr-only">Hoy</span> : null}
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
