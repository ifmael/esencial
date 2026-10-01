// /historial — índice de los días registrados (sección Deporte): del más
// reciente al más antiguo, por meses, con lo hecho ese día (series y cardio
// marcados). La fila lleva al día registrado, que ya existe en /sesion/:date.
import { Link } from "react-router";
import { EmptyState, Loader } from "../components/expressive";
import {
  Alert,
  Button,
  buttonClass,
  cardClass,
  ripple,
} from "../components/ui";
import {
  daySummary,
  groupByMonth,
  type HistoryDay,
  useWorkoutHistory,
} from "../lib/history";
import { formatShortDate } from "../lib/workout";

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
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-title-m text-e">{formatShortDate(day.date)}</span>
        {day.sessionName && (
          <span className="min-w-0 truncate text-label-l text-on-surface-variant">
            {day.sessionName}
          </span>
        )}
      </span>
      <span className="text-body-m text-on-surface-variant">
        {daySummary(day)} · Esfuerzo {day.effort}/5
      </span>
      {day.note && (
        <span className="truncate text-body-s text-on-surface-variant">
          {day.note}
        </span>
      )}
    </Link>
  );
}

export function HistorialPage() {
  const {
    items: days,
    next,
    pending,
    loadingMore,
    error,
    loadMore,
    reload,
  } = useWorkoutHistory();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-headline-l text-e">Historial</h1>
        {days.length > 0 && (
          <p aria-live="polite" className="text-body-m text-on-surface-variant">
            {days.length} {days.length === 1 ? "día" : "días"} registrados
            {next ? ", y más" : ""}
          </p>
        )}
      </header>

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
        <EmptyState title="Aún no hay días registrados">
          <p className="text-body-m text-on-surface-variant">
            Cuando cierres la sesión de un día aparecerá aquí, con sus series y
            su esfuerzo.
          </p>
          <Link
            to="/plan-fuerza"
            className={buttonClass({ variant: "tonal" })}
            onPointerDown={ripple}
          >
            Ir al calendario
          </Link>
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
