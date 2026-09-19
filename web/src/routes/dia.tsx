// DÍA (E5): pantalla '/' alimentada por un único GET /api/day/:date.
// Header navegable con "Hoy" decidido en cliente; secciones RECETA / FUERZA /
// NOTAS con estados vacíos + CTA; autosave de notas (debounce 800 ms, flush al
// cambiar de fecha vía desmontaje del editor keyed por fecha).
//
// Variante A (acabado): misma estructura —mismos bloques, mismo orden, misma
// rejilla de 3 columnas en escritorio— con el sistema aplicado: etiquetas de
// sección en micro-mayúsculas, tarjetas de 16px, filas con hover y entrada
// escalonada de las tres columnas.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudIcon,
  UtensilsIcon,
} from "../components/icons";
import {
  Badge,
  Button,
  Card,
  cardClass,
  Input,
  Textarea,
} from "../components/ui";
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
    <header className="mb-section flex flex-col items-start gap-3">
      {/* El título abre en el mismo borde que la rejilla de abajo: los
          controles de fecha van detrás, nunca por delante del texto. */}
      <div className="flex w-full items-center gap-2">
        <h1 className="min-w-0 flex-1 text-balance text-title leading-tight font-bold first-letter:uppercase lg:text-display">
          {isToday ? "Hoy — " : ""}
          {formatDateEs(date)}
        </h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Día anterior"
          className="text-text"
          onClick={() => onChange(addDays(date, -1))}
        >
          <ChevronLeftIcon width={22} height={22} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Día siguiente"
          className="text-text"
          onClick={() => onChange(addDays(date, 1))}
        >
          <ChevronRightIcon width={22} height={22} />
        </Button>
      </div>

      {/* Una fila, dos naturalezas: el control de fecha (con caja) a la
          izquierda y la navegación a los planes (sin caja) a la derecha. */}
      <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {/* Un solo control de fecha: "Hoy" y el selector comparten caja, así
            que hay una sola affordance de calendario y un solo borde. */}
        <div className="inline-flex h-9 items-center rounded-control border border-border bg-surface p-0.5">
          <button
            type="button"
            aria-label="Ir a hoy"
            onClick={() => onChange(new Date())}
            className="grid h-8 place-items-center rounded-[calc(var(--radius-control)-2px)] px-2.5 text-caption font-semibold text-primary transition-colors duration-150 ease-out-quart hover:bg-primary-soft"
          >
            Hoy
          </button>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
          {/* ponytail: input nativo; un picker con librería si saltar fechas fine. */}
          <Input
            type="date"
            aria-label="Ir a una fecha"
            className="h-8 min-h-0 w-auto border-0 bg-transparent px-1.5 text-caption shadow-none"
            value={toISODate(date)}
            onChange={(e) => {
              if (e.target.value)
                onChange(new Date(`${e.target.value}T00:00:00`));
            }}
          />
        </div>

        <nav className="flex flex-wrap items-center gap-1">
          <QuickLink to="/plan-recetas">Plan recetas</QuickLink>
          <QuickLink to="/plan-fuerza">Plan fuerza</QuickLink>
        </nav>
      </div>
    </header>
  );
}

function QuickLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group inline-flex h-9 items-center rounded-control pr-2.5 pl-3 text-caption font-semibold text-text-secondary transition-colors duration-150 ease-out-quart hover:bg-primary-soft hover:text-primary"
    >
      {children}
      <ChevronRightIcon
        width={16}
        height={16}
        className="transition-transform duration-200 ease-out-quart group-hover:translate-x-0.5"
      />
    </Link>
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
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="section-label">{title}</h2>
      {children}
    </section>
  );
}

/** Estado vacío de una sección: mismo molde para receta y fuerza. */
function EmptyState({
  text,
  action,
}: {
  text: string;
  action: { to: string; label: string };
}) {
  return (
    <Card className="flex min-h-28 flex-col justify-center items-start gap-2">
      <p className="text-body text-text-secondary">{text}</p>
      <Link
        to={action.to}
        className="group inline-flex items-center gap-1 text-body font-semibold text-primary transition-colors duration-150 ease-out-quart hover:text-primary-dark"
      >
        {action.label}
        <ChevronRightIcon
          width={16}
          height={16}
          className="transition-transform duration-200 ease-out-quart group-hover:translate-x-0.5"
        />
      </Link>
    </Card>
  );
}

function MealsSection({ meals }: { meals: DayData["meals"] }) {
  const navigate = useNavigate();
  const planned = meals.filter((m) => m.recipeName !== null);
  if (planned.length === 0) {
    return (
      <Section title="RECETA">
        <EmptyState
          text="Aún no has planificado comidas para este día"
          action={{ to: "/plan-recetas", label: "Ir al plan semanal" }}
        />
      </Section>
    );
  }
  return (
    <Section title="RECETA">
      <div className="flex flex-col gap-2">
        {planned.map((m) => (
          <button
            type="button"
            key={m.meal}
            className={cardClass(
              "card-interactive group flex w-full items-center gap-3 p-3 text-left",
            )}
            onClick={() => navigate(`/recetario/${m.recipeId}`)}
          >
            {m.recipePhoto ? (
              <img
                src={photoSrc(m.recipePhoto)}
                alt=""
                className="size-14 shrink-0 rounded-panel object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="grid size-14 shrink-0 place-items-center rounded-panel bg-surface-muted text-text-secondary"
              >
                <UtensilsIcon />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="section-label">{m.meal}</span>
              <span className="line-clamp-2 text-lead font-semibold">
                {m.recipeName}
              </span>
            </span>
            <ChevronRightIcon
              width={18}
              height={18}
              className="shrink-0 text-text-secondary transition-transform duration-200 ease-out-quart group-hover:translate-x-0.5"
            />
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
  if (!session) {
    return (
      <Section title="FUERZA">
        <EmptyState
          text="Sin sesión asignada"
          action={{ to: "/plan-fuerza", label: "Ver el plan de fuerza" }}
        />
      </Section>
    );
  }
  if (session.status === "logged" && session.summary) {
    return (
      <Section title="FUERZA">
        <button
          type="button"
          className={cardClass(
            "card-interactive flex w-full flex-col gap-2 text-left",
          )}
          onClick={openWorkout}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-lead font-semibold">
              {session.name ?? "Sesión"}
            </span>
            <Badge tone="done">Hecho</Badge>
          </div>
          <p className="text-caption text-done-text">
            Sesión completada · {session.summary.exercises} ejercicios ·{" "}
            {session.summary.sets} series · esfuerzo {session.summary.effort}/5
          </p>
        </button>
      </Section>
    );
  }
  const exercises = session.exercises ?? [];
  const sets = exercises.reduce((sum, e) => sum + (e.targetSets ?? 0), 0);
  return (
    <Section title="FUERZA">
      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-lead font-semibold">
              {session.name ?? "Sesión"}
            </span>
            {exercises.length > 0 && (
              <span className="text-caption text-text-secondary">
                {exercises.length} ejercicios · {sets} series
              </span>
            )}
          </div>
          <Badge tone="pending">Pendiente</Badge>
        </div>
        {exercises.length > 0 && (
          <ol className="flex flex-col rounded-panel bg-surface-muted p-1">
            {exercises.map((e, i) => (
              <li
                key={e.exerciseId}
                className="flex items-center gap-3 rounded-panel px-2 py-2"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-chip bg-surface text-micro font-bold text-text-secondary">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-body">
                  {e.exerciseName}
                  {e.kind === "strength"
                    ? null
                    : ` · ${KIND_LABELS[e.kind].toLowerCase()}`}
                </span>
              </li>
            ))}
          </ol>
        )}
        <Button className="w-full" onClick={openWorkout}>
          Registrar sesión
        </Button>
      </Card>
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
    <Card className="flex flex-col gap-2 p-3">
      <Textarea
        className="min-h-44 w-full bg-background p-3"
        placeholder="Escribe algo sobre hoy"
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />
      <div
        aria-live="polite"
        className="flex min-h-5 items-center gap-2 px-1 text-caption"
      >
        {status === "idle" && (
          <>
            <CloudIcon width={16} height={16} className="text-text-secondary" />
            <span className="text-text-secondary">Autoguardado</span>
          </>
        )}
        {status === "saving" && (
          <span className="text-text-secondary">Guardando…</span>
        )}
        {status === "saved" && (
          <>
            <CheckIcon width={16} height={16} className="text-done-text" />
            <span className="text-done-text">Guardado</span>
          </>
        )}
        {status === "error" && (
          <>
            <span className="text-error">No guardado</span>
            <button
              type="button"
              className="font-semibold text-primary underline-offset-2 transition-colors duration-150 ease-out-quart hover:underline"
              onClick={() => void save(text)}
            >
              Reintentar guardar
            </button>
          </>
        )}
      </div>
    </Card>
  );
}

function Skeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-x-gutter gap-y-section lg:grid-cols-3"
      aria-busy="true"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          data-testid="skeleton"
          className="flex flex-col gap-3"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <span className="skeleton block h-4 w-24" />
          <span className="skeleton block h-44 w-full" />
        </div>
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
        <Card className="flex flex-col items-start gap-3">
          <p className="text-body text-error">{error}</p>
          <Button variant="secondary" onClick={reload}>
            Reintentar
          </Button>
        </Card>
      ) : data ? (
        <div className="grid grid-cols-1 gap-x-gutter gap-y-section lg:grid-cols-3">
          <div className="animate-rise">
            <MealsSection meals={data.meals ?? []} />
          </div>
          <div className="animate-rise" style={{ animationDelay: "60ms" }}>
            <StrengthSection session={data.session} date={iso} />
          </div>
          <div className="animate-rise" style={{ animationDelay: "120ms" }}>
            <Section title="NOTAS DEL DÍA">
              <NoteEditor
                key={iso}
                date={iso}
                initial={data.note?.text ?? ""}
              />
            </Section>
          </div>
        </div>
      ) : null}
    </>
  );
}
