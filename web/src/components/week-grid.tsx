// Rejilla semanal de fuerza (Lunes→Domingo). Recibe isoWeek y callback de
// cambio de semana; celdas: vacía → picker de plantillas (patrón RecipePicker),
// planned → badge Pendiente + ✕ con confirmación inline, logged → Hecho.
import { useEffect, useState } from "react";
import { toISODate } from "../lib/day";
import { type PlanSession, usePlanWeek } from "../lib/plan-week";

const DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD of day `dayIndex` (0=Lunes) of ISO week, UTC-math, no clock. */
function dayOf(isoWeek: string, dayIndex: number): string {
  const [year, week] = isoWeek.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(
    jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000,
  );
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7 + dayIndex);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

type TemplateSummary = { id: number; name: string };

function TemplatePicker({
  onPick,
  onClose,
}: {
  onPick: (t: TemplateSummary) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/templates")
      .then(async (res) => {
        const all: (TemplateSummary & { rotationIndex: number })[] =
          await res.json();
        setTemplates(all.map((t) => ({ id: t.id, name: t.name })));
      })
      .catch(() => setTemplates([]));
  }, []);

  const needle = query.trim().toLowerCase();
  const shown = templates
    ? needle
      ? templates.filter((t) => t.name.toLowerCase().includes(needle))
      : templates
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Elegir plantilla"
        className="card flex max-h-[80vh] w-full max-w-md flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          autoFocus
          placeholder="Buscar plantilla…"
          aria-label="Buscar plantilla"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 rounded-lg border border-border px-3"
        />
        <ul className="flex flex-col gap-1 overflow-y-auto">
          {templates === null ? (
            <li className="text-text-secondary">Cargando…</li>
          ) : null}
          {shown.map((t) => (
            <li key={t.id}>
              <button
                className="min-h-11 w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-surface-muted"
                onClick={() => onPick(t)}
              >
                {t.name}
              </button>
            </li>
          ))}
          {templates !== null && shown.length === 0 ? (
            <li className="px-3 text-text-secondary">Sin resultados.</li>
          ) : null}
        </ul>
        <button className="btn-secondary" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

function SessionCell({
  date,
  session,
  isToday,
  onAdd,
  onRemove,
}: {
  date: string;
  session: PlanSession | undefined;
  isToday: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const border = isToday ? "border-primary/60" : "";

  if (!session) {
    return (
      <button
        onClick={onAdd}
        className={`flex min-h-11 flex-1 flex-col items-center justify-center rounded-lg border border-dashed text-text-secondary hover:border-primary hover:text-primary ${
          border || "border-border"
        }`}
      >
        <span className="text-sm">+ añadir</span>
      </button>
    );
  }

  const badge =
    session.status === "logged" ? (
      <span className="badge-done self-start">Hecho</span>
    ) : (
      <span className="badge-pending self-start">Pendiente</span>
    );

  return (
    <div
      className={`flex min-h-11 flex-1 flex-col gap-1 rounded-lg border border-border bg-surface p-2 ${border}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {session.templateName}
        </span>
        {session.status === "planned" ? (
          <button
            aria-label={`Desprogramar sesión del ${date}`}
            onClick={() => setConfirming(true)}
            className="min-h-11 px-2 text-text-secondary hover:text-error"
          >
            ✕
          </button>
        ) : null}
      </div>
      {badge}
      {confirming ? (
        <button
          className="btn-primary bg-error min-h-11 text-xs"
          onClick={() => {
            setConfirming(false);
            onRemove();
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
  onShiftWeek,
}: {
  isoWeek: string;
  onShiftWeek: (delta: number) => void;
}) {
  const { sessions, loading, error, create, remove } = usePlanWeek(isoWeek);
  const [picker, setPicker] = useState<string | null>(null);
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
                  onAdd={() => setPicker(date)}
                  onRemove={() => {
                    const s = byDate.get(date);
                    if (s) void remove(s.id);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {picker ? (
        <TemplatePicker
          onClose={() => setPicker(null)}
          onPick={(t) => {
            const date = picker;
            setPicker(null);
            void create(date, t.id);
          }}
        />
      ) : null}
    </section>
  );
}
