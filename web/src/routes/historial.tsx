// /historial — índice de los días registrados (sección Deporte): del más
// reciente al más antiguo, por meses, con lo hecho ese día (series y cardio
// marcados). La fila lleva al día registrado, que ya existe en /sesion/:date.
// El rango de fechas es del usuario (`?from=&to=`), con preselecciones de meses.
import { useState } from "react";
import { Link } from "react-router";
import { EffortScale, EmptyState, Loader } from "../components/expressive";
import {
  CheckIcon,
  DumbbellIcon,
  ListIcon,
  RunIcon,
} from "../components/icons";
import {
  Alert,
  Button,
  buttonClass,
  Chip,
  cardClass,
  Input,
  ripple,
} from "../components/ui";
import {
  groupByMonth,
  type HistoryDay,
  type HistoryRange,
  hasMarks,
  monthsBack,
  NO_RANGE,
  sameRange,
  useWorkoutHistory,
  type VolumeKind,
  volumeLabel,
} from "../lib/history";
import { formatShortDate } from "../lib/workout";

/** Preselecciones del rango: los últimos N meses. El «Todo» (sin fechas) ya lo
 *  cubre el primer chip. */
const PRESETS = [1, 3, 6];

/** Un dato de volumen: icono + cifra, con su nombre («3 ejercicios») en el
 *  nombre accesible y en el `title` — el icono solo, sin la palabra, se leería
 *  como un número suelto. */
function Volume({
  icon: Icon,
  kind,
  value,
}: {
  icon: typeof DumbbellIcon;
  kind: VolumeKind;
  value: number;
}) {
  const label = volumeLabel(kind, value);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="flex items-center gap-1"
    >
      <Icon width={16} height={16} />
      <span className="tabular text-body-m">{value}</span>
    </span>
  );
}

function DayRow({ day }: { day: HistoryDay }) {
  return (
    <Link
      to={`/sesion/${day.date}`}
      className={cardClass(
        "filled",
        "state card-interactive flex min-h-14 w-full flex-col gap-1 p-4",
      )}
      onPointerDown={ripple}
    >
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-title-m text-e">
            {formatShortDate(day.date)}
          </span>
          {day.sessionName && (
            <span className="min-w-0 truncate text-label-l text-on-surface-variant">
              {day.sessionName}
            </span>
          )}
        </span>
        <EffortScale effort={day.effort} className="ml-auto" />
      </span>
      {hasMarks(day) ? (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-on-surface-variant">
          <Volume icon={DumbbellIcon} kind="exercises" value={day.exercises} />
          <Volume icon={ListIcon} kind="sets" value={day.sets} />
          {day.cardio > 0 && (
            <Volume icon={RunIcon} kind="cardio" value={day.cardio} />
          )}
        </span>
      ) : (
        <span className="text-body-s text-on-surface-variant">Sin marcas</span>
      )}
      {day.note && (
        <span className="truncate text-body-s text-on-surface-variant">
          {day.note}
        </span>
      )}
    </Link>
  );
}

/** Selector de rango: preselecciones y las dos fechas (los extremos entran). */
function RangePicker({
  range,
  onChange,
}: {
  range: HistoryRange;
  onChange: (range: HistoryRange) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <fieldset
        aria-label="Rango de fechas"
        className="flex flex-wrap items-center gap-2"
      >
        <Chip
          pressed={sameRange(range, NO_RANGE)}
          onClick={() => onChange(NO_RANGE)}
        >
          {sameRange(range, NO_RANGE) && <CheckIcon width={18} height={18} />}
          Todo
        </Chip>
        {PRESETS.map((months) => {
          const preset = monthsBack(months);
          const on = sameRange(range, preset);
          return (
            <Chip
              key={months}
              pressed={on}
              onClick={() => onChange(on ? NO_RANGE : preset)}
            >
              {on && <CheckIcon width={18} height={18} />}
              {months === 1 ? "Último mes" : `Últimos ${months} meses`}
            </Chip>
          );
        })}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-44 grow flex-col gap-1 sm:grow-0">
          <span aria-hidden="true" className="section-label">
            Desde
          </span>
          <Input
            type="date"
            aria-label="Desde"
            className="min-h-12"
            value={range.from}
            max={range.to === "" ? undefined : range.to}
            onChange={(e) =>
              onChange({ ...range, from: e.currentTarget.value })
            }
          />
        </div>
        <div className="flex min-w-44 grow flex-col gap-1 sm:grow-0">
          <span aria-hidden="true" className="section-label">
            Hasta
          </span>
          <Input
            type="date"
            aria-label="Hasta"
            className="min-h-12"
            value={range.to}
            min={range.from === "" ? undefined : range.from}
            onChange={(e) => onChange({ ...range, to: e.currentTarget.value })}
          />
        </div>
      </div>
    </div>
  );
}

export function HistorialPage() {
  const [range, setRange] = useState<HistoryRange>(NO_RANGE);
  const {
    items: days,
    next,
    pending,
    loadingMore,
    error,
    loadMore,
    reload,
  } = useWorkoutHistory(range);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-headline-l text-e">Historial</h1>
        {days.length > 0 && (
          <p aria-live="polite" className="text-body-m text-on-surface-variant">
            {days.length === 1
              ? "1 día registrado"
              : `${days.length} días registrados`}
            {next ? ", y más" : ""}
          </p>
        )}
      </header>

      <RangePicker range={range} onChange={setRange} />

      {error && (
        <Alert>
          <p className="text-body-m">{error}</p>
          <Button variant="outlined" onClick={reload}>
            Reintentar
          </Button>
        </Alert>
      )}

      {pending && days.length === 0 && <Loader label="Cargando historial…" />}

      {!pending && !error && days.length === 0 && (
        <EmptyState
          title={
            sameRange(range, NO_RANGE)
              ? "Aún no hay días registrados"
              : "No hay días registrados en ese rango"
          }
        >
          <p className="text-body-m text-on-surface-variant">
            {sameRange(range, NO_RANGE)
              ? "Cuando cierres la sesión de un día aparecerá aquí, con sus series y su esfuerzo."
              : "Prueba con otro rango de fechas o quita el filtro."}
          </p>
          {sameRange(range, NO_RANGE) ? (
            <Link
              to="/plan-fuerza"
              className={buttonClass({ variant: "tonal" })}
              onPointerDown={ripple}
            >
              Ir al calendario
            </Link>
          ) : (
            <Button variant="tonal" onClick={() => setRange(NO_RANGE)}>
              Ver todo el historial
            </Button>
          )}
        </EmptyState>
      )}

      {groupByMonth(days).map((month) => (
        <section
          key={month.key}
          aria-labelledby={`mes-${month.key}`}
          className="flex flex-col gap-2"
        >
          <h2 id={`mes-${month.key}`} className="section-label">
            {month.label}
          </h2>
          <ul className="stagger flex flex-col gap-2">
            {month.days.map((day, i) => (
              <li key={day.date} style={{ ["--i" as string]: i }}>
                <DayRow day={day} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {next && (
        <Button
          variant="outlined"
          className="self-center"
          disabled={loadingMore}
          onClick={loadMore}
        >
          {loadingMore ? "Cargando…" : "Cargar más"}
        </Button>
      )}
    </div>
  );
}
