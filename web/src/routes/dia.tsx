// DÍA (E5): pantalla '/' alimentada por un único GET /api/day/:date.
// Header navegable con "Hoy" decidido en cliente; secciones RECETA / FUERZA /
// NOTAS con estados vacíos + CTA; autosave de notas (debounce 800 ms, flush al
// cambiar de fecha vía desmontaje del editor keyed por fecha).
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { apiFetchRaw, photoSrc } from "../lib/api";
import { type DayData, type DaySession, toISODate, useDay } from "../lib/day";
import { KIND_LABELS } from "../lib/exercises";

export function formatDateEs(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function DayHeader({
  date,
  onChange,
}: {
  date: Date;
  onChange: (d: Date) => void;
}) {
  const isToday = toISODate(date) === toISODate(new Date());
  return (
    <header className="mb-6">
      <div className="flex items-center justify-between gap-2">
        <button
          aria-label="Día anterior"
          className="btn-secondary min-h-11 min-w-11"
          onClick={() => onChange(addDays(date, -1))}
        >
          ←
        </button>
        <h1 className="text-2xl font-bold capitalize">
          {isToday ? "Hoy — " : ""}
          {formatDateEs(date)}
        </h1>
        <button
          aria-label="Día siguiente"
          className="btn-secondary min-h-11 min-w-11"
          onClick={() => onChange(addDays(date, 1))}
        >
          →
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          aria-label="Ir a hoy"
          className="btn-secondary"
          onClick={() => onChange(new Date())}
        >
          Hoy
        </button>
        {/* ponytail: input nativo; un picker con librería si saltar fechas fine. */}
        <input
          type="date"
          aria-label="Ir a una fecha"
          className="min-h-11 rounded-lg border border-border bg-surface px-2"
          value={toISODate(date)}
          onChange={(e) => {
            if (e.target.value)
              onChange(new Date(`${e.target.value}T00:00:00`));
          }}
        />
      </div>
      <nav className="mt-2 flex justify-center gap-4 text-sm font-medium text-primary">
        <Link to="/plan-recetas">Plan recetas</Link>
        <Link to="/plan-fuerza">Plan fuerza</Link>
      </nav>
    </header>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function MealsSection({ meals }: { meals: DayData["meals"] }) {
  const navigate = useNavigate();
  const planned = meals.filter((m) => m.recipeName !== null);
  if (planned.length === 0) {
    return (
      <Section title="RECETA">
        <div className="card text-text-secondary">
          <p>Aún no has planificado comidas para este día</p>
          <Link
            to="/plan-recetas"
            className="mt-2 inline-block font-semibold text-primary"
          >
            Ir al plan semanal
          </Link>
        </div>
      </Section>
    );
  }
  return (
    <Section title="RECETA">
      <div className="flex flex-col gap-2">
        {planned.map((m) => (
          <button
            key={m.meal}
            className="card flex min-h-11 items-center gap-3 text-left"
            onClick={() => navigate(`/recetario/${m.recipeId}`)}
          >
            {m.recipePhoto ? (
              <img
                src={photoSrc(m.recipePhoto)}
                alt=""
                className="size-12 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="size-12 shrink-0 rounded-lg bg-surface-muted"
              />
            )}
            <span className="min-w-0 flex-1 truncate font-semibold">
              {m.recipeName}
            </span>
            <span className="text-sm text-text-secondary">{m.meal}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function StrengthSection({
  session,
  date,
}: {
  session: DaySession | null;
  date: string;
}) {
  const navigate = useNavigate();
  const openWorkout = () => navigate(`/sesion/${date}`);
  return (
    <Section title="FUERZA">
      {!session ? (
        <div className="card text-text-secondary">
          <p>Sin sesión asignada</p>
          <Link
            to="/plan-fuerza"
            className="mt-2 inline-block font-semibold text-primary"
          >
            Ver el plan de fuerza
          </Link>
        </div>
      ) : session.status === "logged" && session.summary ? (
        <button className="card w-full text-left" onClick={openWorkout}>
          <div className="flex items-center gap-2">
            <span className="badge-done">Hecho</span>
            <span className="font-semibold">{session.name ?? "Sesión"}</span>
          </div>
          <p className="mt-1 text-sm text-done-text">
            Sesión completada · {session.summary.exercises} ejercicios ·{" "}
            {session.summary.sets} series · esfuerzo {session.summary.effort}/5
          </p>
        </button>
      ) : (
        <div className="card">
          <div className="flex items-center gap-2">
            <span className="badge-pending">Pendiente</span>
            <span className="font-semibold">{session.name ?? "Sesión"}</span>
          </div>
          {session.status === "planned" && session.exercises?.length ? (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-text-secondary">
              {session.exercises.map((e) => (
                <li key={e.exerciseId}>
                  {e.exerciseName}
                  {e.kind === "strength"
                    ? null
                    : ` · ${KIND_LABELS[e.kind].toLowerCase()}`}
                </li>
              ))}
            </ol>
          ) : null}
          <button
            className="btn-primary mt-3 min-h-11 w-full"
            onClick={openWorkout}
          >
            Registrar sesión
          </button>
        </div>
      )}
    </Section>
  );
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_MS = 800;

/** Editor de la nota del día. El padre lo monta con key={date}: al cambiar de
 * fecha, el desmontaje guarda lo pendiente contra la fecha vieja (closure de
 * `date`) y el editor nuevo arranca con la nota de la fecha nueva. */
export function NoteEditor({
  date,
  initial,
}: {
  date: string;
  initial: string;
}) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draft = useRef(text);
  draft.current = text;

  async function save(value: string) {
    clearTimeout(timer.current);
    timer.current = undefined;
    setStatus("saving");
    try {
      const res = await apiFetchRaw(`/api/notes/${date}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  function onChange(value: string) {
    setText(value);
    clearTimeout(timer.current);
    if (value === initial) {
      timer.current = undefined;
      setStatus("idle");
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void save(value);
    }, AUTOSAVE_MS);
  }

  // Pendiente al desmontar (cambio de fecha): se guarda en la fecha que se deja.
  useEffect(
    () => () => {
      if (timer.current !== undefined) void save(draft.current);
    },
    [],
  );

  return (
    <div className="card">
      <textarea
        className="min-h-28 w-full rounded-lg border border-border bg-background p-2"
        placeholder="Escribe algo sobre hoy"
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />
      <div aria-live="polite" className="mt-1 flex items-center gap-2 text-sm">
        {status === "saving" && (
          <span className="text-text-secondary">Guardando…</span>
        )}
        {status === "saved" && <span className="text-done-text">Guardado</span>}
        {status === "error" && (
          <>
            <span className="text-error">No guardado</span>
            <button
              className="font-semibold text-primary"
              onClick={() => void save(text)}
            >
              Reintentar guardar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          data-testid="skeleton"
          className="card h-24 animate-pulse bg-surface-muted"
        />
      ))}
    </div>
  );
}

export function DiaPage() {
  const [date, setDate] = useState(() => new Date());
  const iso = toISODate(date);
  const { data, loading, error, reload } = useDay(iso);
  return (
    <>
      <DayHeader date={date} onChange={setDate} />
      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className="card">
          <p className="text-error">{error}</p>
          <button className="btn-primary mt-2" onClick={reload}>
            Reintentar
          </button>
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <MealsSection meals={data.meals ?? []} />
          <StrengthSection session={data.session} date={iso} />
          <Section title="NOTAS DEL DÍA">
            <NoteEditor key={iso} date={iso} initial={data.note?.text ?? ""} />
          </Section>
        </div>
      ) : null}
    </>
  );
}
