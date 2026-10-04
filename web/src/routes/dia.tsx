// DÍA (E5): pantalla '/' alimentada por un único GET /api/day/:date.
// Header navegable con "Hoy" decidido en cliente; secciones RECETA / FUERZA /
// NOTAS con estados vacíos + CTA; autosave de notas (debounce 800 ms, flush al
// cambiar de fecha vía desmontaje del editor keyed por fecha).
//
// M3 Expressive: cabecera *hero* (fecha en display + progreso ondulado del
// día), carrusel de comidas a lo ancho, FUERZA en verde deporte y NOTAS como
// campo outlined. Jerarquía por tonos, sin sombras; entrada escalonada.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  EmptyState,
  Monogram,
  Shape,
  WavyRing,
} from "../components/expressive";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudIcon,
  DumbbellIcon,
  PlayIcon,
  UtensilsIcon,
} from "../components/icons";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  ConnectedGroup,
  cardClass,
  Field,
  Input,
  ripple,
  Textarea,
} from "../components/ui";
import { apiFetchRaw, photoSrc } from "../lib/api";
import {
  type DayData,
  type DaySession,
  dayProgress,
  toISODate,
  useDay,
} from "../lib/day";
import { KIND_LABELS } from "../lib/exercises";
import { useMe } from "../lib/family";

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
  progress,
  name,
}: {
  date: Date;
  onChange: (d: Date) => void;
  /** Pasos del día (`dayProgress`); sin datos aún, no se pinta el anillo. */
  progress?: { done: number; total: number };
  /** Nombre de perfil para el saludo; `null` mientras no lo ponga. */
  name?: string | null;
}) {
  const isToday = toISODate(date) === toISODate(new Date());
  return (
    <header className="relative mb-section flex flex-col gap-3 overflow-hidden rounded-xl rounded-tr-xxl bg-surface-container-low p-card md:p-8 lg:gap-6">
      {/* Forma decorativa de fondo: el tono sube un escalón, sin contraste que leer.
       * Móvil: con una sola fila quedaría detrás de los botones. */}
      <span className="pointer-events-none absolute -top-20 -right-16 hidden lg:block">
        <Shape
          name="flower"
          size={240}
          className="text-surface-container-high"
        />
      </span>
      {/* Móvil: sin título visible (la fecha ya está en la fila); `contents`
       * para que la fila vacía no sume el hueco de la cabecera. */}
      <div className="contents lg:relative lg:flex lg:items-start lg:justify-between lg:gap-4">
        <h1 className="sr-only min-w-0 text-balance text-display-s text-e md:text-display-m lg:not-sr-only">
          {isToday && (
            <span className="block text-title-l text-e text-accent">
              Hoy<span className="sr-only"> — </span>
            </span>
          )}
          <span className="block first-letter:uppercase">
            {formatDateEs(date)}
          </span>
        </h1>
        {progress && (
          <div className="hidden shrink-0 flex-col items-center gap-1 lg:flex">
            <WavyRing
              value={progress.done}
              max={progress.total}
              className="size-24"
              label={`Progreso del día: ${progress.done} de ${progress.total} pasos`}
            >
              <span className="text-headline-m text-e tabular leading-none text-on-surface">
                {progress.done}
              </span>
              <span className="block text-label-m tabular text-on-surface-variant">
                de {progress.total}
              </span>
            </WavyRing>
            <span className="text-label-m text-on-surface-variant">
              Pasos del día
            </span>
          </div>
        )}
      </div>

      {/* Bienvenida: solo el día en curso (el cliente decide «hoy»). Sin
       * nombre puesto saluda igual, sin él. */}
      {isToday && (
        <p className="relative text-body-l text-on-surface-variant">
          {`Hola${name ? ` ${name}` : ""}, estos son los planes que tienes para HOY`}
        </p>
      )}

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <ConnectedGroup label="Cambiar de día" className="w-full lg:w-auto">
          <Button
            variant="tonal"
            size="icon"
            aria-label="Día anterior"
            onClick={() => onChange(addDays(date, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          {/* Sin título en móvil, «pulsado» es lo que dice que el día es hoy. */}
          <Button
            variant="tonal"
            aria-label="Ir a hoy"
            aria-pressed={isToday}
            onClick={() => onChange(new Date())}
          >
            Hoy
          </Button>
          {/* ponytail: input nativo; un picker con librería si saltar fechas fine.
           * `.connected > *` hace crecer a todas las piezas por igual: `grow-10`
           * le da a la fecha casi todo el hueco libre de la fila en móvil. */}
          <Input
            type="date"
            aria-label="Ir a una fecha"
            className="w-auto min-w-0 grow-10 rounded-s border-0 bg-secondary-container px-4 text-title-m text-on-secondary-container lg:text-label-l"
            value={toISODate(date)}
            // Chromium de escritorio solo abre el calendario desde el icono:
            // así se abre al pulsar en cualquier punto. Si el navegador lo
            // rechaza (sin gesto, iframe), queda el comportamiento nativo.
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {}
            }}
            onChange={(e) => {
              if (e.target.value)
                onChange(new Date(`${e.target.value}T00:00:00`));
            }}
          />
          <Button
            variant="tonal"
            size="icon"
            aria-label="Día siguiente"
            onClick={() => onChange(addDays(date, 1))}
          >
            <ChevronRightIcon />
          </Button>
        </ConnectedGroup>

        {/* En móvil ya están en la barra inferior de secciones. */}
        <nav
          aria-label="Planes"
          className="hidden flex-wrap items-center gap-2 lg:flex"
        >
          <QuickLink to="/plan-recetas" section="nutricion" icon={UtensilsIcon}>
            Plan recetas
          </QuickLink>
          <QuickLink to="/plan-fuerza" section="deporte" icon={DumbbellIcon}>
            Plan fuerza
          </QuickLink>
        </nav>
      </div>
    </header>
  );
}

/** Enlace tonal a un plan, en el color de su sección. */
function QuickLink({
  to,
  section,
  icon: Icon,
  children,
}: {
  to: string;
  section: "nutricion" | "deporte";
  icon: typeof UtensilsIcon;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      data-section={section}
      onPointerDown={ripple}
      className={buttonClass({
        variant: "tonal",
        className: "bg-accent-container pl-4 text-on-accent-container",
      })}
    >
      <Icon width={20} height={20} />
      {children}
    </Link>
  );
}

function Section({
  title,
  section,
  children,
}: {
  title: string;
  section?: "nutricion" | "deporte";
  children: React.ReactNode;
}) {
  return (
    <section data-section={section} className="flex min-w-0 flex-col gap-3">
      <h2 className="section-label">{title}</h2>
      {children}
    </section>
  );
}

/** Estado vacío de una sección: formas M3E + CTA tonal. */
function SectionEmpty({
  text,
  action,
}: {
  text: string;
  action: { to: string; label: string };
}) {
  return (
    <Card className="rounded-xl">
      <EmptyState title={text}>
        <Link
          to={action.to}
          onPointerDown={ripple}
          className={buttonClass({ variant: "tonal", className: "pr-4" })}
        >
          {action.label}
          <ChevronRightIcon width={20} height={20} />
        </Link>
      </EmptyState>
    </Card>
  );
}

/** Carrusel M3 *multi-browse*: la primera comida grande, las demás más
 * estrechas, todas de la misma altura; se desliza con `scroll-snap`. */
function MealsSection({
  meals,
  nutrition,
}: {
  meals: DayData["meals"];
  nutrition: DayData["nutrition"];
}) {
  const planned = meals.filter((m) => m.recipeName !== null);
  if (planned.length === 0) {
    return (
      <Section title="RECETA" section="nutricion">
        <SectionEmpty
          text="Aún no has planificado comidas para este día"
          action={{ to: "/plan-recetas", label: "Ir al plan semanal" }}
        />
      </Section>
    );
  }
  return (
    <Section title="RECETA" section="nutricion">
      <ul
        aria-label="Comidas del día"
        className="stagger flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
      >
        {planned.map((m, i) => (
          <li
            key={m.meal}
            style={{ ["--i" as string]: i }}
            className={`h-56 shrink-0 snap-start md:h-64 ${
              i === 0
                ? "basis-4/5 sm:basis-1/2 lg:basis-5/12"
                : "basis-3/5 sm:basis-1/3 lg:basis-1/4"
            }`}
          >
            <Link
              to={`/recetario/${m.recipeId}`}
              onPointerDown={ripple}
              className="state group flex size-full flex-col justify-between overflow-hidden rounded-xl bg-surface-container-high text-on-surface transition-[border-radius] motion-spatial-fast active:rounded-l"
            >
              {m.recipePhoto ? (
                <img
                  crossOrigin="use-credentials"
                  src={photoSrc(m.recipePhoto)}
                  alt=""
                  className="absolute inset-0 -z-10 size-full object-cover transition-transform motion-spatial group-hover:scale-105"
                />
              ) : (
                <Monogram
                  name={m.recipeName ?? ""}
                  size={i === 0 ? 112 : 80}
                  className="m-4 transition-transform motion-spatial group-hover:rotate-12"
                />
              )}
              <span
                className={`mt-auto flex flex-col gap-1 p-4 ${
                  m.recipePhoto ? "bg-photo-veil text-on-photo" : ""
                }`}
              >
                <span className="text-label-m text-e uppercase">{m.meal}</span>
                <span
                  className={`line-clamp-2 text-e ${
                    i === 0 ? "text-headline-s" : "text-title-l"
                  }`}
                >
                  {m.recipeName}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {nutrition && <DayTotal n={nutrition} />}
    </Section>
  );
}

/** Lo que suman las comidas del día: una ración de cada receta. */
function DayTotal({ n }: { n: NonNullable<DayData["nutrition"]> }) {
  return (
    <section
      aria-label="Total del día"
      className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-l bg-surface-container-low px-4 py-3"
    >
      <span className="text-label-l text-on-surface-variant">
        Total del día
      </span>
      <span className="text-title-l text-e text-accent tabular">
        {n.kcal} kcal
      </span>
      <span className="text-body-m tabular">
        {n.protein} g proteínas · {n.fat} g grasas · {n.carbs} g carbohidratos
      </span>
      {n.approximate && (
        <span className="basis-full text-body-s text-on-surface-variant">
          Aproximado: alguna receta tiene ingredientes sin contar.
        </span>
      )}
    </section>
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
  if (!session) {
    return (
      <Section title="FUERZA" section="deporte">
        <SectionEmpty
          text="Sin sesión asignada"
          action={{ to: "/plan-fuerza", label: "Ver el plan de fuerza" }}
        />
      </Section>
    );
  }
  if (session.status === "logged" && session.summary) {
    const stats = [
      ["Ejercicios", String(session.summary.exercises)],
      ["Series", String(session.summary.sets)],
      ["Esfuerzo", `${session.summary.effort}/5`],
    ];
    return (
      <Section title="FUERZA" section="deporte">
        <Link
          to={`/sesion/${date}`}
          onPointerDown={ripple}
          className={cardClass(
            "tonal",
            "card-interactive state flex flex-col gap-4 rounded-xl",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-title-l text-e">
              {session.name ?? "Sesión"}
            </span>
            <Badge tone="done">
              <CheckIcon width={16} height={16} />
              Hecho
            </Badge>
          </div>
          <p className="sr-only">
            Sesión completada · {session.summary.exercises} ejercicios ·{" "}
            {session.summary.sets} series · esfuerzo {session.summary.effort}/5
          </p>
          <dl aria-hidden="true" className="stagger grid grid-cols-3 gap-2">
            {stats.map(([label, value], i) => (
              <div
                key={label}
                style={{ ["--i" as string]: i }}
                className="flex flex-col-reverse gap-1 rounded-l bg-primary-container p-3 text-on-primary-container"
              >
                <dt className="text-label-m">{label}</dt>
                <dd className="text-headline-m text-e tabular leading-none">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Link>
      </Section>
    );
  }
  const exercises = session.exercises ?? [];
  const sets = exercises.reduce((sum, e) => sum + (e.targetSets ?? 0), 0);
  return (
    <Section title="FUERZA" section="deporte">
      <Card className="flex flex-col gap-4 rounded-xl">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-title-l text-e">
              {session.name ?? "Sesión"}
            </span>
            {exercises.length > 0 && (
              <span className="text-body-m tabular text-on-surface-variant">
                {exercises.length} ejercicios · {sets} series
              </span>
            )}
          </div>
          <Badge tone="pending">Pendiente</Badge>
        </div>
        {exercises.length > 0 && (
          <ol className="stagger flex flex-col gap-1">
            {exercises.map((e, i) => (
              <li
                key={e.exerciseId}
                style={{ ["--i" as string]: i }}
                className="flex min-h-12 items-center gap-3 rounded-m bg-surface-container-high px-3 py-2"
              >
                <Shape
                  name="cookie-9"
                  size={32}
                  className="text-accent-container"
                >
                  <span className="text-label-l text-e tabular text-on-accent-container">
                    {i + 1}
                  </span>
                </Shape>
                <span className="min-w-0 flex-1 truncate text-body-l">
                  {e.exerciseName}
                  {e.kind === "strength"
                    ? null
                    : ` · ${KIND_LABELS[e.kind].toLowerCase()}`}
                </span>
              </li>
            ))}
          </ol>
        )}
        <Button
          size="lg"
          className="w-full"
          onClick={() => navigate(`/sesion/${date}`)}
        >
          <PlayIcon />
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
    // La etiqueta flotante tapa el borde con el tono de la tarjeta.
    <Card className="flex flex-col gap-3 rounded-xl">
      <Field label="Escribe algo sobre hoy">
        {(a) => (
          <Textarea
            {...a}
            className="min-h-44"
            value={text}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
      <div
        aria-live="polite"
        className="flex min-h-5 items-center gap-2 px-1 text-body-s text-on-surface-variant"
      >
        {status === "idle" && (
          <>
            <CloudIcon width={16} height={16} />
            <span>Autoguardado</span>
          </>
        )}
        {status === "saving" && <span>Guardando…</span>}
        {status === "saved" && (
          <>
            <CheckIcon width={16} height={16} className="text-accent" />
            <span>Guardado</span>
          </>
        )}
      </div>
      {status === "error" && (
        <Alert>
          <p className="text-body-m">No se ha guardado la nota.</p>
          <Button variant="outlined" onClick={() => void save(text)}>
            Reintentar guardar
          </Button>
        </Alert>
      )}
    </Card>
  );
}

function Skeleton() {
  return (
    <div
      className="stagger grid grid-cols-1 gap-x-gutter gap-y-section lg:grid-cols-2"
      aria-busy="true"
    >
      {["h-56 md:h-64 lg:col-span-2", "h-72", "h-72"].map((box, i) => (
        <div
          key={box + i}
          data-testid="skeleton"
          className={`flex flex-col gap-3 ${i === 0 ? "lg:col-span-2" : ""}`}
          style={{ ["--i" as string]: i }}
        >
          <span className="skeleton block h-4 w-24" />
          <span className={`skeleton block w-full rounded-xl ${box}`} />
        </div>
      ))}
    </div>
  );
}

export function DiaPage() {
  const [date, setDate] = useState(() => new Date());
  const iso = toISODate(date);
  const { data, loading, error, reload } = useDay(iso);
  const me = useMe();
  return (
    <>
      <DayHeader
        date={date}
        onChange={setDate}
        progress={data ? dayProgress(data) : undefined}
        name={me.data?.name ?? null}
      />
      {loading ? (
        <Skeleton />
      ) : error ? (
        <Alert>
          <p className="text-body-m">{error}</p>
          <Button variant="outlined" onClick={reload}>
            Reintentar
          </Button>
        </Alert>
      ) : data ? (
        <div className="stagger grid grid-cols-1 gap-x-gutter gap-y-section lg:grid-cols-2">
          <div
            className="min-w-0 lg:col-span-2"
            style={{ ["--i" as string]: 0 }}
          >
            <MealsSection
              meals={data.meals ?? []}
              nutrition={data.nutrition ?? null}
            />
          </div>
          <div className="min-w-0" style={{ ["--i" as string]: 1 }}>
            <StrengthSection session={data.session} date={iso} />
          </div>
          <div className="min-w-0" style={{ ["--i" as string]: 2 }}>
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
