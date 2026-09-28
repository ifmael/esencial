// /sesion/:date — registro del día (wireframe pantalla-3). El estado planned es
// un borrador en memoria sobre los ejercicios de la sesión (fuerza y cardio);
// el estado logged es solo lectura desde GET /api/workout-logs/:date.
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  CountUp,
  EmptyState,
  Loader,
  RewardSeal,
  Shape,
  WavyRing,
} from "../components/expressive";
import {
  BackIcon,
  BikeIcon,
  CheckIcon,
  ChevronDownIcon,
  RunIcon,
} from "../components/icons";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  Checkbox,
  cx,
  Field,
  Input,
  Textarea,
} from "../components/ui";
import { ApiError, apiGet, apiSend } from "../lib/api";
import type { PlanSession, SessionExercise } from "../lib/plan-week";
import { isSessionComplete } from "../lib/reward";
import type { ShapeName } from "../lib/shapes";
import {
  defaultSetCount,
  formatLast,
  formatSetText,
  isValidDateStr,
  noteOrNull,
  numOrNull,
  parseDateEs,
  setsProgress,
} from "../lib/workout";
import { formatDateEs } from "./dia";

// --- Wire types (camelCase after the E6 setLogSchema normalization) ---------

type LastValue = { weightKg: number; reps: number; date: string };

type SetLogItem = {
  planSessionExerciseId: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  done: boolean;
  exerciseName: string;
};

type CardioLogItem = {
  planSessionExerciseId: number;
  exerciseName: string;
  distanceKm: number | null;
  durationMin: number | null;
  done: boolean;
};

type LoggedDay = {
  date: string;
  status: string;
  readOnly: boolean;
  effort: number;
  note: string | null;
  session: { id: number; name: string | null } | null;
  sets: SetLogItem[];
  cardio: CardioLogItem[];
};

// --- Draft model -------------------------------------------------------------

type DraftSet = { weightKg: number | null; reps: number | null; done: boolean };
type DraftExercise = {
  se: SessionExercise;
  last: LastValue | null;
  sets: DraftSet[];
};
type CardioDraft = {
  se: SessionExercise;
  distanceKm: number | null;
  durationMin: number | null;
  done: boolean;
};

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "draft";
      session: PlanSession;
      exercises: DraftExercise[];
      cardio: CardioDraft[];
      historyFailed: boolean;
      effort: number | null;
      note: string;
      pending: boolean;
      submitError: string | null;
    }
  | { kind: "logged"; session: PlanSession | null; log: LoggedDay };

const EFFORT_LABELS = ["Muy fácil", "Fácil", "Moderado", "Duro", "Máximo"];
/** Cada punto de esfuerzo gana lóbulos al llenarse: de círculo a sol. */
const EFFORT_SHAPES: ShapeName[] = [
  "circle",
  "cookie-4",
  "cookie-7",
  "cookie-9",
  "sunny",
];

// --- Hook: orchestrates reads + the close POST -------------------------------

export function useWorkoutDay(date: string) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    if (!isValidDateStr(date)) {
      setView({ kind: "invalid" });
      return;
    }
    setView({ kind: "loading" });
    try {
      const sessions = await apiGet<PlanSession[]>("/api/plan-sessions");
      const session = sessions.find((s) => s.date === date);
      if (!session) return setView({ kind: "empty" });
      if (session.status === "logged") {
        const log = await apiGet<LoggedDay>(`/api/workout-logs/${date}`);
        return setView({ kind: "logged", session, log });
      }
      const detail = await apiGet<PlanSession>(
        `/api/plan-sessions/${session.id}`,
      );
      const items = [...detail.exercises].sort(
        (a, b) => a.position - b.position,
      );
      let historyFailed = false;
      const strength = items.filter((e) => e.kind === "strength");
      const exercises: DraftExercise[] = await Promise.all(
        strength.map(async (se) => {
          let last: LastValue | null = null;
          try {
            last = (
              await apiGet<{ last: LastValue | null }>(
                `/api/exercises/${se.exerciseId}/last`,
              )
            ).last;
          } catch {
            historyFailed = true;
          }
          return {
            se,
            last,
            sets: Array.from(
              { length: defaultSetCount(se.targetSets) },
              () => ({
                weightKg: last?.weightKg ?? null,
                reps: last?.reps ?? se.targetRepsMin ?? null,
                done: false,
              }),
            ),
          };
        }),
      );
      const cardio: CardioDraft[] = items
        .filter((e) => e.kind !== "strength")
        .map((se) => ({
          se,
          distanceKm: null,
          durationMin: null,
          done: false,
        }));
      setView({
        kind: "draft",
        session,
        exercises,
        cardio,
        historyFailed,
        effort: null,
        note: "",
        pending: false,
        submitError: null,
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.error : "No se pudo cargar el día";
      setView({ kind: "error", message });
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchDraft = (
    patch: (
      v: Extract<View, { kind: "draft" }>,
    ) => Partial<Extract<View, { kind: "draft" }>>,
  ) => setView((v) => (v.kind === "draft" ? { ...v, ...patch(v) } : v));

  const mutateSet = (
    seId: number,
    setIdx: number,
    patch: (s: DraftSet) => DraftSet,
  ) =>
    patchDraft((v) => ({
      exercises: v.exercises.map((ex) =>
        ex.se.id !== seId
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((s, i) => (i === setIdx ? patch(s) : s)),
            },
      ),
    }));

  const setDraftValue = (
    seId: number,
    setIdx: number,
    field: "weightKg" | "reps",
    value: string,
  ) => mutateSet(seId, setIdx, (s) => ({ ...s, [field]: numOrNull(value) }));

  const stepValue = (
    seId: number,
    setIdx: number,
    field: "weightKg" | "reps",
    delta: number,
  ) =>
    mutateSet(seId, setIdx, (s) => ({
      ...s,
      [field]: Math.max(0, (s[field] ?? 0) + delta),
    }));

  const toggleDone = (seId: number, setIdx: number) =>
    mutateSet(seId, setIdx, (s) => ({ ...s, done: !s.done }));

  const completeExercise = (seId: number) =>
    patchDraft((v) => ({
      exercises: v.exercises.map((ex) =>
        ex.se.id !== seId
          ? ex
          : { ...ex, sets: ex.sets.map((s) => ({ ...s, done: true })) },
      ),
    }));

  const mutateCardio = (seId: number, patch: (c: CardioDraft) => CardioDraft) =>
    patchDraft((v) => ({
      cardio: v.cardio.map((c) => (c.se.id === seId ? patch(c) : c)),
    }));

  const setCardioValue = (
    seId: number,
    field: "distanceKm" | "durationMin",
    value: string,
  ) => {
    const parsed = numOrNull(value);
    mutateCardio(seId, (c) => ({
      ...c,
      [field]: parsed,
      // Escribir marcas implica que se hizo (aunque el checkbox no se toque).
      done: parsed === null ? c.done : true,
    }));
  };

  const toggleCardioDone = (seId: number) =>
    mutateCardio(seId, (c) => ({ ...c, done: !c.done }));

  const setEffort = (effort: number) => patchDraft(() => ({ effort }));
  const setNote = (note: string) => patchDraft(() => ({ note }));
  const toggleExpand = (seId: number) =>
    setExpanded((m) => ({ ...m, [seId]: !m[seId] }));

  /** Cerrar sesión: single in-flight POST; 201→B, 409→refetch into B, 400→banner + draft. */
  const close = () => {
    setView((v) => {
      if (v.kind !== "draft" || v.effort === null || v.pending) return v;
      void (async () => {
        const payload = {
          effort: v.effort,
          note: noteOrNull(v.note),
          sets: v.exercises.flatMap((ex) =>
            ex.sets.map((s, i) => ({
              planSessionExerciseId: ex.se.id,
              setIndex: i,
              weightKg: s.weightKg,
              reps: s.reps,
              done: s.done,
            })),
          ),
          cardio: v.cardio
            .filter(
              (c) => c.done || c.distanceKm !== null || c.durationMin !== null,
            )
            .map((c) => ({
              planSessionExerciseId: c.se.id,
              distanceKm: c.distanceKm,
              durationMin: c.durationMin,
              done: c.done,
            })),
        };
        try {
          const log = await apiSend<LoggedDay>(
            `/api/workout-logs/${date}`,
            "POST",
            payload,
          );
          setView({ kind: "logged", session: v.session, log });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            try {
              const log = await apiGet<LoggedDay>(`/api/workout-logs/${date}`);
              setView({ kind: "logged", session: v.session, log });
              return;
            } catch {
              /* fall through to the error banner below */
            }
          }
          const field =
            err instanceof ApiError && err.field ? ` (${err.field})` : "";
          const message =
            err instanceof ApiError ? err.error : "No se pudo cerrar la sesión";
          patchDraft(() => ({
            pending: false,
            submitError: `${message}${field}`,
          }));
        }
      })();
      return { ...v, pending: true, submitError: null };
    });
  };

  return {
    view,
    expanded,
    setEffort,
    setNote,
    setDraftValue,
    stepValue,
    toggleDone,
    completeExercise,
    setCardioValue,
    toggleCardioDone,
    toggleExpand,
    close,
    reload: load,
  };
}

// --- Small presentational pieces --------------------------------------------

function BackLink() {
  return (
    <Link
      to="/"
      aria-label="Volver al día"
      className={buttonClass({ variant: "text", size: "icon" })}
    >
      <BackIcon />
    </Link>
  );
}

function Header({
  date,
  name,
  logged,
  progress,
}: {
  date: string;
  name: string;
  logged: boolean;
  progress?: { done: number; total: number };
}) {
  return (
    <header className="relative mb-6 flex flex-col items-start gap-4 overflow-hidden rounded-xl rounded-tr-xxl bg-surface-container-low p-5 sm:flex-row sm:items-center md:p-6">
      <Shape
        name="sunny"
        size={220}
        className="pointer-events-none absolute -top-20 -right-16 text-accent-container opacity-60"
      />
      <div className="relative flex w-full min-w-0 flex-1 flex-col gap-2">
        <div className="-ml-3 flex min-w-0 items-center gap-1">
          <BackLink />
          <h1 className="min-w-0 text-headline-m text-e first-letter:uppercase md:text-headline-l">
            {formatDateEs(parseDateEs(date))}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-title-l text-accent">{name}</span>
          {logged && <Badge tone="done">Registrado</Badge>}
        </div>
      </div>
      {progress && progress.total > 0 && (
        <div className="relative rounded-full bg-surface-container-lowest p-1">
          <WavyRing
            value={progress.done}
            max={progress.total}
            label="Series hechas"
            size={112}
          >
            <CountUp
              value={progress.done}
              className="block text-headline-m text-e leading-none text-on-surface"
            />
            <span className="tabular text-label-s text-on-surface-variant">
              de {progress.total}
            </span>
          </WavyRing>
        </div>
      )}
    </header>
  );
}

/** Contador con −/+ y su nombre visible delante («Peso (kg)  −  55  +»). El
 * `context` («Press banca serie 1») completa el nombre accesible del campo y de
 * los dos botones, para que el lector de pantalla distinga un campo de otro. */
function Stepper({
  caption,
  context,
  value,
  step,
  onValue,
  onStep,
}: {
  caption: string;
  context: string;
  value: number | null;
  step: number;
  onValue: (v: string) => void;
  onStep: (d: number) => void;
}) {
  const label = `${caption} · ${context}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/* Sin `<label>`: el primer control etiquetable sería el botón «−». */}
      <span className="px-1 text-label-m text-on-surface-variant">
        {caption}
      </span>
      <div className="flex items-center gap-1">
        <Button
          aria-label={`Reducir ${label}`}
          variant="tonal"
          size="icon"
          className="text-title-l"
          onClick={() => onStep(-step)}
        >
          −
        </Button>
        <Input
          type="number"
          inputMode="decimal"
          aria-label={label}
          className="tabular min-w-0 flex-1 px-0 text-center text-title-m"
          value={value === null ? "" : String(value)}
          onChange={(e) => onValue(e.target.value)}
        />
        <Button
          aria-label={`Aumentar ${label}`}
          variant="tonal"
          size="icon"
          className="text-title-l"
          onClick={() => onStep(step)}
        >
          +
        </Button>
      </div>
    </div>
  );
}

/** Esfuerzo percibido: cinco formas que ganan lóbulos al llenarse (de círculo
 * a sol). Con `onSelect` es un grupo de radios; sin él, solo lectura. */
function EffortDots({
  effort,
  onSelect,
}: {
  effort: number | null;
  onSelect?: (v: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Esfuerzo percibido"
      className="flex justify-between gap-1"
    >
      {EFFORT_LABELS.map((label, i) => {
        const value = i + 1;
        const filled = effort !== null && effort >= value;
        const chosen = effort === value;
        return (
          <label
            key={value}
            className={cx(
              "flex min-h-12 flex-1 flex-col items-center gap-1 rounded-m py-1",
              onSelect &&
                "state cursor-pointer has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent",
            )}
          >
            <span
              data-testid="effort-dot"
              data-filled={String(filled)}
              className={cx(
                "grid size-12 place-items-center transition-transform motion-spatial-fast",
                chosen && "scale-115",
              )}
            >
              <Shape
                name={filled ? EFFORT_SHAPES[i] : "circle"}
                size={filled ? 44 : 28}
                className={cx(
                  "transition-colors motion-effects",
                  filled ? "text-accent" : "text-outline-variant",
                )}
              />
            </span>
            <span
              className={cx(
                "text-center text-label-s",
                chosen ? "text-e text-on-surface" : "text-on-surface-variant",
              )}
            >
              {label}
            </span>
            {onSelect && (
              <input
                type="radio"
                name="effort"
                aria-label={`Esfuerzo ${value}: ${label}`}
                className="sr-only"
                checked={chosen}
                onChange={() => onSelect(value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

/** Marca de fila: una forma que pasa de galleta a sol al completarse. */
function RowMark({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <Shape
      name={done ? "sunny" : "cookie-9"}
      size={40}
      className={cx(
        "transition-colors motion-effects",
        done ? "text-on-accent-container" : "text-accent-container",
      )}
    >
      <span
        className={cx(
          "grid place-items-center text-label-l tabular",
          done ? "text-accent-container" : "text-on-accent-container",
        )}
      >
        {done ? <CheckIcon width={20} height={20} /> : children}
      </span>
    </Shape>
  );
}

const doneCard = (done: boolean) =>
  cx(
    "transition-colors motion-effects",
    done && "bg-accent-container text-on-accent-container",
  );

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="flex flex-col">
    <span className="text-display-s text-e tabular">{value}</span>
    <span className="text-label-m">{label}</span>
  </div>
);

// --- Page ---------------------------------------------------------------------

export function SesionPage() {
  const { date = "" } = useParams<{ date: string }>();
  const day = useWorkoutDay(date);
  const { view } = day;

  if (view.kind === "invalid")
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-headline-l text-e">Fecha no válida</h1>
        <EmptyState
          title="La dirección debe terminar en una fecha con formato AAAA-MM-DD."
          shapes={["soft-diamond", "pill", "clover"]}
        >
          <Link to="/" className={buttonClass({ variant: "tonal" })}>
            <BackIcon /> Volver al día
          </Link>
        </EmptyState>
      </div>
    );

  if (view.kind === "empty")
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-headline-l text-e first-letter:uppercase">
          {formatDateEs(parseDateEs(date))}
        </h1>
        <EmptyState title="Sin sesión asignada para este día.">
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/plan-fuerza" className={buttonClass()}>
              Planificar en Plan fuerza
            </Link>
            <Link to="/" className={buttonClass({ variant: "text" })}>
              <BackIcon /> Volver al día
            </Link>
          </div>
        </EmptyState>
      </div>
    );

  if (view.kind === "error")
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-headline-l text-e">Error</h1>
        <Alert>{view.message}</Alert>
        <Button
          variant="tonal"
          className="self-start"
          onClick={() => void day.reload()}
        >
          Reintentar
        </Button>
      </div>
    );

  if (view.kind === "loading")
    return <Loader label="Cargando sesión…" className="mx-auto my-16" />;

  if (view.kind === "logged") {
    const { log } = view;
    const byExercise = log.sets.reduce<Record<number, SetLogItem[]>>(
      (acc, s) => {
        acc[s.planSessionExerciseId] ??= [];
        acc[s.planSessionExerciseId].push(s);
        return acc;
      },
      {},
    );
    const progress = setsProgress(log.sets, log.cardio);
    const mark = (done: boolean) =>
      done ? (
        <CheckIcon filled width={20} height={20} className="text-accent" />
      ) : (
        <span className="size-5 rounded-full border-2 border-outline" />
      );
    return (
      <div className="pb-8">
        <Header
          date={date}
          name={log.session?.name ?? view.session?.name ?? "Sesión"}
          logged
        />
        <section
          aria-label="Resumen"
          className="relative mb-4 overflow-hidden rounded-xl rounded-tr-xxl bg-accent-container p-6 text-on-accent-container"
        >
          <Shape
            name="sunny"
            size={160}
            className="absolute -top-12 -right-12 text-accent opacity-20"
          />
          <div className="relative flex flex-wrap gap-x-10 gap-y-4">
            <Stat
              value={`${progress.done}/${progress.total}`}
              label="Series hechas"
            />
            <Stat value={`${log.effort}/5`} label="Esfuerzo" />
          </div>
        </section>
        <div className="stagger flex flex-col gap-3">
          {Object.entries(byExercise).map(([seId, sets], i) => (
            <Card
              key={seId}
              className="flex flex-col gap-2"
              style={{ ["--i" as string]: i }}
            >
              <h2 className="text-title-m">{sets[0].exerciseName}</h2>
              <ul className="flex flex-col gap-1">
                {sets.map((s) => (
                  <li
                    key={s.setIndex}
                    className="flex min-h-10 items-center gap-3 rounded-m bg-surface-container-high px-3"
                  >
                    <span aria-hidden="true" className="grid size-5">
                      {mark(s.done)}
                    </span>
                    <span className="w-16 text-body-m text-on-surface-variant">
                      Serie {s.setIndex + 1}
                    </span>
                    <span
                      className={cx(
                        "text-title-m tabular",
                        !s.done && "text-on-surface-variant",
                      )}
                    >
                      {formatSetText(s)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {log.cardio.map((c, i) => (
            <Card
              key={c.planSessionExerciseId}
              className="flex flex-col gap-2"
              style={{
                ["--i" as string]: Object.keys(byExercise).length + i,
              }}
            >
              <h2 className="text-title-m">{c.exerciseName}</h2>
              <p className="flex min-h-10 items-center gap-3 rounded-m bg-surface-container-high px-3">
                <span aria-hidden="true" className="grid size-5">
                  {mark(c.done)}
                </span>
                <span className="text-title-m tabular">
                  {c.distanceKm === null && c.durationMin === null
                    ? "Hecho sin marcas"
                    : `${c.distanceKm ?? "—"} km · ${c.durationMin ?? "—"} min`}
                </span>
              </p>
            </Card>
          ))}
          <Card
            className="flex flex-col gap-3"
            style={{
              ["--i" as string]:
                Object.keys(byExercise).length + log.cardio.length,
            }}
          >
            <h2 className="text-title-m">Esfuerzo percibido</h2>
            <EffortDots effort={log.effort} />
            {log.note && (
              <p className="rounded-m bg-surface-container-high p-3 text-body-l">
                {log.note}
              </p>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // state A — editable draft
  const v = view;
  const progress = setsProgress(
    v.exercises.flatMap((ex) => ex.sets),
    v.cardio,
  );
  const complete = isSessionComplete(v.exercises, v.cardio);
  const openPending = v.exercises.find(
    (ex) => day.expanded[ex.se.id] && ex.sets.some((s) => !s.done),
  );
  return (
    <div className="pb-24">
      <Header
        date={date}
        name={v.session.name ?? "Sesión"}
        logged={false}
        progress={progress}
      />
      {v.historyFailed && (
        <Alert tone="info" className="mb-3">
          No se pudo cargar el histórico de últimos pesos; puedes registrarlo
          igualmente a mano.
        </Alert>
      )}
      {v.submitError && <Alert className="mb-3">{v.submitError}</Alert>}
      <div className="stagger flex flex-col gap-3">
        {v.exercises.map((ex, idx) => {
          const open = !!day.expanded[ex.se.id];
          const helper = formatLast(ex.last);
          const allDone = ex.sets.every((s) => s.done);
          return (
            <Card
              key={ex.se.id}
              className={doneCard(allDone)}
              style={{ ["--i" as string]: idx }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <RowMark done={allDone}>{idx + 1}</RowMark>
                  <div className="flex min-w-0 flex-col">
                    <Link
                      to={`/ejercicios/${ex.se.exerciseId}`}
                      className="text-title-m text-e underline-offset-4 hover:underline"
                    >
                      {ex.se.exerciseName}
                    </Link>
                    {helper && (
                      <span className="tabular text-body-s text-on-surface-variant">
                        {helper}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {!open &&
                    ex.sets.map((s, i) => (
                      <Checkbox
                        key={i}
                        aria-label={`${ex.se.exerciseName} serie ${i + 1}`}
                        checked={s.done}
                        onChange={() => day.toggleDone(ex.se.id, i)}
                      />
                    ))}
                  <Button
                    aria-label={`Series de ${ex.se.exerciseName}`}
                    aria-expanded={open}
                    variant="tonal"
                    size="sm"
                    onClick={() => day.toggleExpand(ex.se.id)}
                  >
                    {open ? "Ocultar" : "Registrar series"}
                    <ChevronDownIcon
                      width={20}
                      height={20}
                      className={cx(
                        "transition-transform motion-spatial-fast",
                        open && "rotate-180",
                      )}
                    />
                  </Button>
                </div>
              </div>
              {open && (
                <ul className="stagger mt-3 flex flex-col gap-2">
                  {ex.sets.map((s, i) => {
                    const ctx = `${ex.se.exerciseName} serie ${i + 1}`;
                    return (
                      <li
                        key={i}
                        style={{ ["--i" as string]: i }}
                        className={cx(
                          "flex flex-col gap-2 rounded-l p-2 transition-colors motion-effects sm:flex-row sm:items-end",
                          s.done
                            ? "bg-surface-container-lowest"
                            : "bg-surface-container-high",
                        )}
                      >
                        <div className="flex items-center gap-1">
                          <Checkbox
                            aria-label={ctx}
                            checked={s.done}
                            onChange={() => day.toggleDone(ex.se.id, i)}
                          />
                          <span className="w-14 text-label-l text-on-surface-variant">
                            Serie {i + 1}
                          </span>
                        </div>
                        <div className="grid flex-1 grid-cols-2 gap-3">
                          <Stepper
                            caption="Peso (kg)"
                            context={ctx}
                            value={s.weightKg}
                            step={2.5}
                            onValue={(val) =>
                              day.setDraftValue(ex.se.id, i, "weightKg", val)
                            }
                            onStep={(d) =>
                              day.stepValue(ex.se.id, i, "weightKg", d)
                            }
                          />
                          <Stepper
                            caption="Reps"
                            context={ctx}
                            value={s.reps}
                            step={1}
                            onValue={(val) =>
                              day.setDraftValue(ex.se.id, i, "reps", val)
                            }
                            onStep={(d) =>
                              day.stepValue(ex.se.id, i, "reps", d)
                            }
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}

        {v.cardio.map((c, i) => {
          const Icon = c.se.kind === "bike" ? BikeIcon : RunIcon;
          return (
            <Card
              key={c.se.id}
              className={doneCard(c.done)}
              style={{ ["--i" as string]: v.exercises.length + i }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <RowMark done={c.done}>
                    <Icon width={20} height={20} />
                  </RowMark>
                  <Link
                    to={`/ejercicios/${c.se.exerciseId}`}
                    className="text-title-m text-e underline-offset-4 hover:underline"
                  >
                    {c.se.exerciseName}
                  </Link>
                </div>
                <label className="flex cursor-pointer items-center pr-3 text-label-l">
                  <Checkbox
                    aria-label={`${c.se.exerciseName} hecho`}
                    checked={c.done}
                    onChange={() => day.toggleCardioDone(c.se.id)}
                  />
                  Hecho
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-l bg-surface-container-high p-2">
                <Stepper
                  caption="Distancia (km)"
                  context={c.se.exerciseName}
                  value={c.distanceKm}
                  step={1}
                  onValue={(val) =>
                    day.setCardioValue(c.se.id, "distanceKm", val)
                  }
                  onStep={(d) =>
                    day.setCardioValue(
                      c.se.id,
                      "distanceKm",
                      String(Math.max(0, (c.distanceKm ?? 0) + d)),
                    )
                  }
                />
                <Stepper
                  caption="Tiempo (min)"
                  context={c.se.exerciseName}
                  value={c.durationMin}
                  step={5}
                  onValue={(val) =>
                    day.setCardioValue(c.se.id, "durationMin", val)
                  }
                  onStep={(d) =>
                    day.setCardioValue(
                      c.se.id,
                      "durationMin",
                      String(Math.max(0, (c.durationMin ?? 0) + d)),
                    )
                  }
                />
              </div>
            </Card>
          );
        })}

        {/* Justo tras la última fila: donde está la vista al marcarla. */}
        {complete && (
          <div>
            <RewardSeal sets={progress.done} />
          </div>
        )}

        <Card
          className="flex flex-col gap-4"
          style={{ ["--i" as string]: v.exercises.length + v.cardio.length }}
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-title-m">Esfuerzo percibido</h2>
            {v.effort === null && (
              <p className="text-body-s text-on-surface-variant">
                Elige cómo fue para poder cerrar la sesión.
              </p>
            )}
          </div>
          <EffortDots effort={v.effort} onSelect={day.setEffort} />
          <Field label="Nota de la sesión">
            {(a) => (
              <Textarea
                {...a}
                className="min-h-24"
                value={v.note}
                onChange={(e) => day.setNote(e.target.value)}
              />
            )}
          </Field>
        </Card>
      </div>

      <div
        role="toolbar"
        aria-label="Acciones de la sesión"
        className="toolbar fixed inset-x-0 bottom-24 z-30 mx-auto flex w-fit items-center gap-2 p-2 lg:bottom-6"
      >
        <Button
          variant="text"
          size="icon"
          aria-label={
            openPending
              ? `Marcar todas las series de ${openPending.se.exerciseName}`
              : "Marcar todo el ejercicio abierto"
          }
          disabled={!openPending}
          onClick={() => openPending && day.completeExercise(openPending.se.id)}
        >
          <CheckIcon />
        </Button>
        <span className="px-2 text-title-m text-e">
          <span aria-hidden="true" className="tabular">
            {progress.done}/{progress.total}
          </span>
          <span className="sr-only">
            {progress.done} de {progress.total} series hechas
          </span>
        </span>
        <Button disabled={v.effort === null || v.pending} onClick={day.close}>
          {v.pending ? "Cerrando…" : "Cerrar sesión"}
        </Button>
      </div>
    </div>
  );
}
