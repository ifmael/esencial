// Rejilla semanal de fuerza (Lunes→Domingo). Presentacional: la página es dueña
// del hook usePlanWeek, del picker y del editor del día. Celdas: vacía →
// "+ añadir"; planned → nombre + badge Pendiente + ✕ con confirmación inline;
// logged → badge Hecho y tap hacia la pantalla de sesión (solo lectura).
import { useState } from "react";
import { useNavigate } from "react-router";
import { toISODate } from "../lib/day";
import type { PlanSession } from "../lib/plan-week";

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

function SessionCell({
  date,
  session,
  isToday,
  onOpen,
  onRemove,
}: {
  date: string;
  session: PlanSession | undefined;
  isToday: boolean;
  onOpen: () => void;
  onRemove: (id: number) => void;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const border = isToday ? "border-primary/60" : "";

  if (!session) {
    return (
      <button
        onClick={onOpen}
        className={`flex min-h-11 flex-1 flex-col items-center justify-center rounded-lg border border-dashed text-text-secondary hover:border-primary hover:text-primary ${
          border || "border-border"
        }`}
      >
        <span className="text-sm">+ añadir</span>
      </button>
    );
  }

  const logged = session.status === "logged";
  const badge = logged ? (
    <span className="badge-done self-start">Hecho</span>
  ) : (
    <span className="badge-pending self-start">Pendiente</span>
  );

  return (
    <div
      className={`flex min-h-11 flex-1 flex-col gap-1 rounded-lg border border-border bg-surface p-2 ${border}`}
    >
      <div className="flex items-center gap-2">
        <button
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
          aria-label={
            logged ? `Ver sesión del ${date}` : `Editar sesión del ${date}`
          }
          onClick={() => (logged ? navigate(`/sesion/${date}`) : onOpen())}
        >
          {session.name ?? "Sesión"}
        </button>
        {logged ? null : (
          <button
            aria-label={`Desprogramar sesión del ${date}`}
            onClick={() => setConfirming(true)}
            className="min-h-11 px-2 text-text-secondary hover:text-error"
          >
            ✕
          </button>
        )}
      </div>
      {badge}
      {confirming ? (
        <button
          className="btn-primary min-h-11 bg-error text-xs"
          onClick={() => {
            setConfirming(false);
            onRemove(session.id);
          }}
        >
          Confirmar desprogramar
        </button>
      ) : null}
    </div>
  );
}

export function WeekGrid({
  isoWeek,
  sessions,
  loading,
  error,
  onShiftWeek,
  onOpenDay,
  onRemove,
}: {
  isoWeek: string;
  sessions: PlanSession[];
  loading: boolean;
  error: string | null;
  onShiftWeek: (delta: number) => void;
  onOpenDay: (date: string) => void;
  onRemove: (id: number) => void;
}) {
  const today = toISODate(new Date());
  const byDate = new Map(sessions.map((s) => [s.date, s]));

  return (
    <section className="card flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <button
          aria-label="Semana anterior"
          className="btn-secondary"
          onClick={() => onShiftWeek(-1)}
        >
          ‹
        </button>
        <h2 className="text-xl font-bold">{isoWeek}</h2>
        <button
          aria-label="Semana siguiente"
          className="btn-secondary"
          onClick={() => onShiftWeek(1)}
        >
          ›
        </button>
      </header>

      {error ? (
        <div role="alert" className="text-error">
          {error}
        </div>
      ) : null}
      {loading && sessions.length === 0 ? (
        <div className="text-text-secondary">Cargando…</div>
      ) : (
        <div className="flex flex-col gap-3 md:grid md:grid-flow-col md:auto-cols-fr md:gap-2">
          {DAYS.map((day, di) => {
            const date = dayOf(isoWeek, di);
            return (
              <div key={day} className="flex flex-col gap-2">
                <h3 className="font-semibold">
                  {day}
                  {date === today ? (
                    <span className="ml-2 text-xs font-bold text-primary">
                      Hoy
                    </span>
                  ) : null}
                </h3>
                <SessionCell
                  date={date}
                  session={byDate.get(date)}
                  isToday={date === today}
                  onOpen={() => onOpenDay(date)}
                  onRemove={onRemove}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
