// /sesion/:date — registro del día (wireframe pantalla-3). El estado planned es
// un borrador en memoria sobre los ejercicios de la sesión (fuerza y cardio);
// el estado logged se lee de GET /api/workout-logs/:date y «Editar» lo vuelve a
// abrir como borrador para corregirlo (PUT).
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  EditIcon,
  PlayIcon,
  RunIcon,
} from "../components/icons";
import { type ModeItem, SessionMode } from "../components/session-mode";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  Chain,
  cx,
  Field,
  Textarea,
} from "../components/ui";
import { ApiError, apiGet, apiSend } from "../lib/api";
import {
  clearDraft,
  readDraft,
  restoreCardio,
  restoreExercises,
  snapshotOf,
  writeDraft,
} from "../lib/day-draft";
import {
  type ExerciseKind,
  type ExerciseMetric,
  targetSummary,
} from "../lib/exercises";
import {
  type PlanSession,
  planItems,
  type SessionExercise,
} from "../lib/plan-week";
import { isSessionComplete } from "../lib/reward";
import { useCreateMorph } from "../lib/view-transition";
import {
  addedSet,
  blockLabel,
  blocks,
  copiedMarks,
  defaultSetCount,
  EFFORT_LABELS,
  EFFORT_SHAPES,
  formatLast,
  formatPrevious,
  formatSetText,
  type HomologMarks,
  isNoWeight,
  isSetFilled,
  isValidDateStr,
  MAX_SETS,
  MIN_SETS,
  noteOrNull,
  numOrNull,
  parseDateEs,
  previousMarks,
  previousSession,
  type SetFields,
  setFields,
  setsProgress,
} from "../lib/workout";
import { formatDateEs } from "./dia";

// --- Wire types (camelCase after the E6 setLogSchema normalization) ---------

type LastValue = {
  weightKg: number | null;
  reps: number | null;
  durationSecs: number | null;
  date: string;
};

type SetLogItem = {
  planSessionExerciseId: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  durationSecs: number | null;
  done: boolean;
  exerciseId: number;
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

/** `touched`: el usuario editó sus marcas; solo entonces las marcas deciden `done`. */
type DraftSet = {
  weightKg: number | null;
  reps: number | null;
  durationSecs: number | null;
  done: boolean;
  touched: boolean;
};
type DraftExercise = {
  se: SessionExercise;
  last: LastValue | null;
  /** Marcas de la sesión anterior con el mismo nombre («vie, 26/09: 60×10 · …»). */
  previous: string | null;
  /** Esa misma sesión, serie a serie: la homóloga de cada serie del borrador. */
  prevSets: (HomologMarks | null)[];
  /** Unidad de la serie (la declara el catálogo); decide qué campos se piden. */
  metric: ExerciseMetric;
  /** Sin peso: se oculta el campo de kilos, bastan las reps y viaja weightKg null. */
  noWeight: boolean;
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
      /** El registro que se está corrigiendo (PUT); null = sesión planificada (POST). */
      editing: LoggedDay | null;
    }
  | { kind: "logged"; session: PlanSession | null; log: LoggedDay };

type Draft = Extract<View, { kind: "draft" }>;

/** Borrador sobre los ejercicios de la sesión: vacío si está planificada, o con
 * lo registrado (`log`) para corregirlo. «última» y la sesión anterior se miden
 * contra `date`, no contra hoy: registrar o corregir un día pasado no mira el futuro. */
async function buildDraft(
  date: string,
  session: PlanSession,
  sessions: readonly PlanSession[],
  log: LoggedDay | null,
): Promise<Draft> {
  const detail = await apiGet<PlanSession>(`/api/plan-sessions/${session.id}`);
  const items = [...detail.exercises].sort((a, b) => a.position - b.position);
  const prev = previousSession(sessions, date, session.name);
  const prevLog = prev
    ? await apiGet<LoggedDay>(`/api/workout-logs/${prev.date}`).catch(
        () => null,
      )
    : null;
  let historyFailed = false;
  // Autoguardado: al abrir una sesión planificada se recupera lo que hubiera
  // quedado del último intento. Al corregir un registro manda el registro.
  const stored = log ? null : readDraft(date);
  let exercises: DraftExercise[] = await Promise.all(
    items
      .filter((e) => e.kind === "strength")
      .map(async (se) => {
        let last: LastValue | null = null;
        try {
          last = (
            await apiGet<{ last: LastValue | null }>(
              `/api/exercises/${se.exerciseId}/last?before=${date}`,
            )
          ).last;
        } catch {
          historyFailed = true;
        }
        const logged =
          log?.sets.filter((s) => s.planSessionExerciseId === se.id) ?? [];
        const prevSets =
          prevLog?.sets.filter((s) => s.exerciseId === se.exerciseId) ?? [];
        const noWeight =
          logged.length > 0
            ? isNoWeight(logged)
            : last !== null && isNoWeight([last]);
        // Qué pide la serie lo decide la métrica del ejercicio; «sin peso» solo
        // suelta el kg de «Peso × reps». El resto de campos no se piden ni se
        // siembran (el registro los normaliza al guardar).
        const fields = setFields(se.metric, noWeight);
        return {
          se,
          last,
          previous: prev && formatPrevious(prev.date, prevSets),
          prevSets: previousMarks(prevSets),
          metric: se.metric,
          noWeight,
          sets:
            logged.length > 0
              ? logged.map(({ weightKg, reps, durationSecs, done }) => ({
                  weightKg,
                  reps,
                  durationSecs,
                  // Hecha solo con sus marcas: un registro antiguo sin ellas no cuenta.
                  done:
                    done &&
                    isSetFilled({ weightKg, reps, durationSecs }, fields),
                  touched: false,
                }))
              : Array.from({ length: defaultSetCount(se.targetSets) }, () => ({
                  weightKg: fields.weight ? (last?.weightKg ?? null) : null,
                  reps: fields.reps
                    ? (last?.reps ?? se.targetRepsMin ?? null)
                    : null,
                  durationSecs: fields.time
                    ? (last?.durationSecs ?? null)
                    : null,
                  done: false,
                  touched: false,
                })),
        };
      }),
  );
  const cardio: CardioDraft[] = restoreCardio(
    items
      .filter((e) => e.kind !== "strength")
      .map((se) => {
        const c = log?.cardio.find((x) => x.planSessionExerciseId === se.id);
        return {
          se,
          distanceKm: c?.distanceKm ?? null,
          durationMin: c?.durationMin ?? null,
          done: c?.done ?? false,
        };
      }),
    stored?.cardio,
  );
  if (stored) exercises = restoreExercises(exercises, stored.exercises);
  return {
    kind: "draft",
    session,
    exercises,
    cardio,
    historyFailed,
    effort: log?.effort ?? stored?.effort ?? null,
    note: log?.note ?? stored?.note ?? "",
    pending: false,
    submitError: null,
    editing: log,
  };
}

const loadError = (err: unknown): View => ({
  kind: "error",
  message: err instanceof ApiError ? err.error : "No se pudo cargar el día",
});

/** Elementos del modo interactivo: el borrador en el orden del día — fuerza
 *  con sus series y marcas, cardio con su «Hecho» — para ir uno a uno. Es la
 *  única superficie donde se registra: la página solo resume. */
function modeItems(v: Draft): ModeItem[] {
  const rows = [
    ...v.exercises.map((ex) => ({
      position: ex.se.position,
      item: {
        id: ex.se.id,
        name: ex.se.exerciseName,
        kind: ex.se.kind,
        objective: targetSummary(ex.se),
        sets: ex.sets.map((s) => ({
          weightKg: s.weightKg,
          reps: s.reps,
          durationSecs: s.durationSecs,
          done: s.done,
          filled: isSetFilled(s, setFields(ex.metric, ex.noWeight)),
        })),
        prevSets: ex.prevSets,
        distanceKm: null,
        durationMin: null,
        done: null,
        metric: ex.metric,
        noWeight: ex.noWeight,
        restSecs: ex.se.restSecs ?? null,
        restAfterSecs: ex.se.restAfterSecs ?? null,
        superset: ex.se.superset,
      },
    })),
    ...v.cardio.map((c) => ({
      position: c.se.position,
      item: {
        id: c.se.id,
        name: c.se.exerciseName,
        kind: c.se.kind,
        objective: targetSummary(c.se),
        sets: null,
        prevSets: [],
        distanceKm: c.distanceKm,
        durationMin: c.durationMin,
        done: c.done,
        metric: c.se.metric,
        noWeight: false,
        restSecs: null,
        restAfterSecs: c.se.restAfterSecs ?? null,
        superset: false,
      },
    })),
  ];
  return rows.sort((a, b) => a.position - b.position).map((r) => r.item);
}

// --- Hook: orchestrates reads + the close POST / edit PUT --------------------

export function useWorkoutDay(date: string) {
  const [view, setView] = useState<View>({ kind: "loading" });
  // La lista de la última carga: de ahí sale la sesión anterior al corregir.
  const sessionsRef = useRef<PlanSession[]>([]);

  const load = useCallback(async () => {
    if (!isValidDateStr(date)) {
      setView({ kind: "invalid" });
      return;
    }
    setView({ kind: "loading" });
    try {
      const sessions = await apiGet<PlanSession[]>("/api/plan-sessions");
      sessionsRef.current = sessions;
      const session = sessions.find((s) => s.date === date);
      // Sin sesión o ya registrada, un borrador guardado de ese día sobra.
      if (!session) {
        clearDraft(date);
        return setView({ kind: "empty" });
      }
      if (session.status === "logged") {
        clearDraft(date);
        const log = await apiGet<LoggedDay>(`/api/workout-logs/${date}`);
        return setView({ kind: "logged", session, log });
      }
      setView(await buildDraft(date, session, sessions, null));
    } catch (err) {
      setView(loadError(err));
    }
  }, [date]);

  /** «Editar» un registro: el mismo borrador, precargado con lo registrado. Lo
   * abre el modo sesión, que es donde se corrige (y guarda con PUT). */
  const startEdit = () => {
    if (view.kind !== "logged" || !view.session) return;
    const { session, log } = view;
    setView({ kind: "loading" });
    buildDraft(date, session, sessionsRef.current, log).then(setView, (err) =>
      setView(loadError(err)),
    );
  };

  /** Salir de la corrección: vuelve al registro tal cual estaba, sin tocar nada. */
  const cancelEdit = useCallback(
    () =>
      setView((v) =>
        v.kind === "draft" && v.editing
          ? { kind: "logged", session: v.session, log: v.editing }
          : v,
      ),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Autoguardado: cada cambio del borrador de una sesión planificada se escribe
  // en `localStorage` tal cual (marcas, cardio, esfuerzo y nota), así que un
  // refresco accidental no pierde nada. Corrigiendo un registro no se guarda.
  useEffect(() => {
    if (view.kind !== "draft" || view.editing) return;
    writeDraft(
      date,
      snapshotOf(view.exercises, view.cardio, view.effort, view.note),
    );
  }, [date, view]);

  const patchDraft = (patch: (v: Draft) => Partial<Draft>) =>
    setView((v) => (v.kind === "draft" ? { ...v, ...patch(v) } : v));

  const mutateSet = (
    seId: number,
    setIdx: number,
    patch: (s: DraftSet, ex: DraftExercise) => DraftSet,
  ) =>
    patchDraft((v) => ({
      exercises: v.exercises.map((ex) =>
        ex.se.id !== seId
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((s, i) => (i === setIdx ? patch(s, ex) : s)),
            },
      ),
    }));

  /** Tocar una marca decide «hecha»: la métrica del ejercicio dice qué campos
   *  hacen falta; vaciar uno requerido la desmarca. La precarga no pasa por aquí. */
  const withMarks = (s: DraftSet, fields: SetFields): DraftSet => ({
    ...s,
    touched: true,
    done: isSetFilled(s, fields),
  });

  const setDraftValue = (
    seId: number,
    setIdx: number,
    field: "weightKg" | "reps" | "durationSecs",
    value: string,
  ) =>
    mutateSet(seId, setIdx, (s, ex) =>
      withMarks(
        { ...s, [field]: numOrNull(value) },
        setFields(ex.metric, ex.noWeight),
      ),
    );

  const stepValue = (
    seId: number,
    setIdx: number,
    field: "weightKg" | "reps" | "durationSecs",
    delta: number,
  ) =>
    mutateSet(seId, setIdx, (s, ex) =>
      withMarks(
        { ...s, [field]: Math.max(0, (s[field] ?? 0) + delta) },
        setFields(ex.metric, ex.noWeight),
      ),
    );

  /** El check manual solo marca una serie completa; desmarcar, siempre. */
  const toggleDone = (seId: number, setIdx: number) =>
    mutateSet(seId, setIdx, (s, ex) => ({
      ...s,
      done: !s.done && isSetFilled(s, setFields(ex.metric, ex.noWeight)),
    }));

  /** Copia la serie homóloga de la sesión anterior: no marca la serie (ver
   * `copiedMarks`) y sin homóloga no toca nada. */
  const copyPrevious = (seId: number, setIdx: number) =>
    mutateSet(seId, setIdx, (s, ex) => {
      const src = ex.prevSets[setIdx] ?? null;
      return src ? copiedMarks(s, src, ex.noWeight) : s;
    });

  /** Cambiar «sin peso» cambia qué es una serie completa: recalcula las editadas. */
  const toggleNoWeight = (seId: number) =>
    patchDraft((v) => ({
      exercises: v.exercises.map((ex) => {
        if (ex.se.id !== seId) return ex;
        const noWeight = !ex.noWeight;
        const fields = setFields(ex.metric, noWeight);
        return {
          ...ex,
          noWeight,
          sets: ex.sets.map((s) =>
            s.touched
              ? withMarks(s, fields)
              : { ...s, done: s.done && isSetFilled(s, fields) },
          ),
        };
      }),
    }));

  /** ➕/➖: el número de series del borrador manda; al guardar viaja al plan. */
  const addSet = (seId: number) =>
    patchDraft((v) => ({
      exercises: v.exercises.map((ex) =>
        ex.se.id !== seId || ex.sets.length >= MAX_SETS
          ? ex
          : {
              ...ex,
              sets: [
                ...ex.sets,
                { ...addedSet(ex.sets), done: false, touched: false },
              ],
            },
      ),
    }));

  const removeSet = (seId: number) =>
    patchDraft((v) => ({
      exercises: v.exercises.map((ex) =>
        ex.se.id !== seId || ex.sets.length <= MIN_SETS
          ? ex
          : { ...ex, sets: ex.sets.slice(0, -1) },
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

  /** Cerrar sesión (POST) o guardar la corrección (PUT): single in-flight;
   * 2xx→B, 409 del POST→refetch into B, 400→banner + draft. */
  const close = () => {
    setView((v) => {
      if (v.kind !== "draft" || v.effort === null || v.pending) return v;
      void (async () => {
        const payload = {
          effort: v.effort,
          note: noteOrNull(v.note),
          sets: v.exercises.flatMap((ex) => {
            const fields = setFields(ex.metric, ex.noWeight);
            return ex.sets.map((s, i) => ({
              planSessionExerciseId: ex.se.id,
              setIndex: i,
              // La métrica decide qué viaja: nada de kilos sembrados que el
              // usuario no vio, ni reps de un ejercicio por tiempo.
              weightKg: fields.weight ? s.weightKg : null,
              reps: fields.reps ? s.reps : null,
              durationSecs: fields.time ? s.durationSecs : null,
              done: s.done,
            }));
          }),
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
          // El día del plan sigue al borrador: la fuerza viaja con sus series
          // (los items que siguen conservan su id, los del registro cuelgan de él).
          const setCounts = new Map(
            v.exercises.map((ex) => [ex.se.id, ex.sets.length]),
          );
          if (
            v.exercises.some(
              (ex) => ex.sets.length !== (ex.se.targetSets ?? null),
            )
          )
            await apiSend(`/api/plan-sessions/${v.session.id}`, "PUT", {
              name: v.session.name,
              items: planItems(
                [
                  ...v.exercises.map((ex) => ex.se),
                  ...v.cardio.map((c) => c.se),
                ].sort((a, b) => a.position - b.position),
                setCounts,
              ),
            });
          const log = await apiSend<LoggedDay>(
            `/api/workout-logs/${date}`,
            v.editing ? "PUT" : "POST",
            payload,
          );
          // El día queda registrado: el borrador guardado ya no vale.
          clearDraft(date);
          setView({ kind: "logged", session: v.session, log });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409 && !v.editing) {
            try {
              const log = await apiGet<LoggedDay>(`/api/workout-logs/${date}`);
              clearDraft(date);
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
    setEffort,
    setNote,
    setDraftValue,
    stepValue,
    toggleDone,
    copyPrevious,
    toggleNoWeight,
    addSet,
    removeSet,
    setCardioValue,
    toggleCardioDone,
    close,
    startEdit,
    cancelEdit,
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
    <header className="relative mb-6 flex flex-col gap-1 overflow-hidden rounded-xl rounded-tr-xxl bg-surface-container-low px-5 py-4 md:p-6">
      <Shape
        name="sunny"
        size={220}
        className="pointer-events-none absolute -top-20 -right-16 text-accent-container opacity-60"
      />
      {/* Una sola fila —flecha, nombre y aro— con el día debajo como subtítulo.
          Antes eran tres bloques apilados (fecha, nombre y aro) y el encabezado
          se comía 284 px de los 844 del móvil. */}
      <div className="relative -ml-3 flex min-w-0 items-center gap-1">
        <BackLink />
        <h1 className="min-w-0 flex-1 text-headline-m text-e first-letter:uppercase md:text-headline-l">
          {name}
        </h1>
        {logged && <Badge tone="done">Registrado</Badge>}
        {progress && progress.total > 0 && (
          <div className="rounded-full bg-surface-container-lowest p-1">
            <WavyRing
              value={progress.done}
              max={progress.total}
              label="Series hechas"
              className="size-20"
              // Sin círculo de fondo: a 0 series el aro no pinta nada y el arco
              // va apareciendo según se marcan (como el del modo sesión).
              waveOnly
            >
              <CountUp
                value={progress.done}
                className="block text-title-l text-e leading-none text-on-surface"
              />
              <span className="tabular text-label-s text-on-surface-variant">
                de {progress.total}
              </span>
            </WavyRing>
          </div>
        )}
      </div>
      {/* `pl-10` son los 48 px de la flecha más los 4 del hueco menos los 12 del
          `-ml-3`: así el día cae alineado con el nombre, no con la flecha. */}
      <p className="relative pl-10 text-body-m text-on-surface-variant first-letter:uppercase">
        {formatDateEs(parseDateEs(date))}
      </p>
    </header>
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
                "hyphens-auto break-words text-center text-label-s",
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

// --- Resumen de la sesión (la página solo lee: se registra en el modo sesión) --

/** Una fila del resumen: el ejercicio del día, lo hecho y lo que se sabe de él. */
type SummaryRow = {
  id: number;
  name: string;
  /** Ficha del ejercicio; un cardio de un registro antiguo puede no tenerla. */
  href: string | null;
  kind: ExerciseKind;
  /** Todo hecho: todas sus series, o el cardio. */
  done: boolean;
  /** Series hechas sobre las del día; `null` en el cardio (no tiene series). */
  counts: { done: number; total: number } | null;
  /** Línea de contexto: la sesión anterior, «última: …» o las marcas del cardio. */
  info: string | null;
  superset: boolean;
  position: number;
};

/** El día planificado, en el orden en que se va a hacer. */
function draftRows(v: Draft): SummaryRow[] {
  const rows: SummaryRow[] = [
    ...v.exercises.map((ex) => ({
      id: ex.se.id,
      name: ex.se.exerciseName,
      href: `/ejercicios/${ex.se.exerciseId}`,
      kind: ex.se.kind,
      done: ex.sets.length > 0 && ex.sets.every((s) => s.done),
      counts: {
        done: ex.sets.filter((s) => s.done).length,
        total: ex.sets.length,
      },
      // La sesión anterior con el mismo nombre manda sobre «última: X×Y».
      info: ex.previous ?? formatLast(ex.last),
      superset: ex.se.superset,
      position: ex.se.position,
    })),
    ...v.cardio.map((c) => ({
      id: c.se.id,
      name: c.se.exerciseName,
      href: `/ejercicios/${c.se.exerciseId}`,
      kind: c.se.kind,
      done: c.done,
      counts: null,
      info: targetSummary(c.se),
      superset: false,
      position: c.se.position,
    })),
  ];
  return rows.sort((a, b) => a.position - b.position);
}

/** El día registrado: lo anotado, con la cadena que trae el plan del día. */
function loggedRows(log: LoggedDay, plan: PlanSession | null): SummaryRow[] {
  // Los sets llegan en el orden del día (`position`), así que el grupo por
  // ejercicio conserva su orden de inserción.
  const byExercise = log.sets.reduce<Record<number, SetLogItem[]>>((acc, s) => {
    acc[s.planSessionExerciseId] ??= [];
    acc[s.planSessionExerciseId].push(s);
    return acc;
  }, {});
  const planned = (seId: number) =>
    plan?.exercises?.find((e) => e.id === seId) ?? null;
  const rows: SummaryRow[] = [];
  for (const [key, sets] of Object.entries(byExercise)) {
    const seId = Number(key);
    const se = planned(seId);
    // Lo hecho es lo marcado: una serie que no se marcó no se anuncia aquí.
    const marks = sets
      .filter((s) => s.done)
      .map(formatSetText)
      .filter((t) => t !== "—");
    rows.push({
      id: seId,
      name: sets[0].exerciseName,
      href: `/ejercicios/${sets[0].exerciseId}`,
      kind: "strength",
      done: sets.every((s) => s.done),
      counts: {
        done: sets.filter((s) => s.done).length,
        total: sets.length,
      },
      info: marks.length > 0 ? marks.join(" · ") : null,
      superset: se?.superset ?? false,
      position: se?.position ?? rows.length,
    });
  }
  for (const c of log.cardio) {
    const se = planned(c.planSessionExerciseId);
    rows.push({
      id: c.planSessionExerciseId,
      name: c.exerciseName,
      href: se ? `/ejercicios/${se.exerciseId}` : null,
      kind: se?.kind ?? "running",
      done: c.done,
      counts: null,
      info:
        c.distanceKm === null && c.durationMin === null
          ? "Hecho sin marcas"
          : `${c.distanceKm ?? "—"} km · ${c.durationMin ?? "—"} min`,
      superset: false,
      position: se?.position ?? Number.MAX_SAFE_INTEGER,
    });
  }
  return rows.sort((a, b) => a.position - b.position);
}

/** La lista del resumen: medallón con el turno, nombre y su «x/y». Inerte: no
 *  hay nada que pulsar más allá del enlace a la ficha del ejercicio. */
function SummaryRows({ rows }: { rows: SummaryRow[] }) {
  const groups = blocks(rows);
  return (
    <ul className="stagger flex flex-col gap-3">
      {groups.map((block, bi) => (
        <Chain
          key={`c${rows[block[0]].id}`}
          label={block.length > 1 ? blockLabel(block.length) : undefined}
          style={{ ["--i" as string]: bi }}
        >
          {block.map((i) => {
            const row = rows[i];
            const Icon = row.kind === "bike" ? BikeIcon : RunIcon;
            return (
              <li key={row.id}>
                <Card className={doneCard(row.done)}>
                  <div className="flex items-center gap-3">
                    <RowMark done={row.done}>
                      {row.kind === "strength" ? (
                        <span className="tabular">{i + 1}</span>
                      ) : (
                        <Icon width={20} height={20} />
                      )}
                    </RowMark>
                    <div className="flex min-w-0 flex-1 flex-col">
                      {row.href ? (
                        <Link
                          to={row.href}
                          className="text-title-m text-e underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        <span className="text-title-m text-e">{row.name}</span>
                      )}
                      {row.info && (
                        <span className="tabular text-body-s text-on-surface-variant">
                          {row.info}
                        </span>
                      )}
                    </div>
                    {row.counts && (
                      <span className="shrink-0 tabular text-title-m">
                        <span aria-hidden="true">
                          {row.counts.done}/{row.counts.total}
                        </span>
                        <span className="sr-only">
                          {row.counts.done} de {row.counts.total} series hechas
                        </span>
                      </span>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </Chain>
      ))}
    </ul>
  );
}

// --- Page ---------------------------------------------------------------------

/** Destino de «Sesión de hoy» del menú FAB: la página entera, en cualquiera de
 * sus estados (la foto «después» se toma aún cargando). */
export function SesionPage() {
  return (
    <div style={useCreateMorph()}>
      <SesionView />
    </div>
  );
}

function SesionView() {
  const { date = "" } = useParams<{ date: string }>();
  const day = useWorkoutDay(date);
  const { view } = day;
  const [mode, setMode] = useState(false);
  // Salir del modo vuelve al resumen; si se estaba corrigiendo un registro,
  // «Cancelar» lo deja como estaba (sin llamar a la API).
  const { cancelEdit } = day;
  const exitMode = useCallback(() => {
    setMode(false);
    cancelEdit();
  }, [cancelEdit]);

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
    return (
      <div className="pb-8">
        <Header
          date={date}
          name={log.session?.name ?? view.session?.name ?? "Sesión"}
          logged
          progress={setsProgress(log.sets, log.cardio)}
        />
        {/* Un día registrado se consulta aquí y se corrige desde el modo
            sesión, precargado con lo registrado (y guardado con PUT). */}
        {view.session && (
          <Button
            variant="tonal"
            className="mb-3 w-full"
            onClick={() => {
              day.startEdit();
              setMode(true);
            }}
          >
            <EditIcon width={20} height={20} /> Editar
          </Button>
        )}
        <SummaryRows rows={loggedRows(log, view.session)} />
        <Card className="mt-3 flex flex-col gap-3">
          <h2 className="text-title-m">Esfuerzo percibido</h2>
          <EffortDots effort={log.effort} />
          {log.note && (
            <p className="rounded-m bg-surface-container-high p-3 text-body-l">
              {log.note}
            </p>
          )}
        </Card>
      </div>
    );
  }

  // estado A — el resumen del día planificado. El registro vive en el modo
  // sesión, que ocupa la pantalla y sustituye la página; el borrador sigue
  // debajo, intacto («Salir» vuelve a él y «Terminar» es «Guardar»).
  const v = view;
  // El ± de la distancia/tiempo del cardio parte de lo que haya y escribe la
  // marca, que implica hecho (lo mismo que teclearla).
  const stepCardio = (
    id: number,
    field: "distanceKm" | "durationMin",
    delta: number,
  ) => {
    const cardio = v.cardio.find((c) => c.se.id === id);
    day.setCardioValue(
      id,
      field,
      String(Math.max(0, (cardio?.[field] ?? 0) + delta)),
    );
  };

  if (mode)
    return (
      <SessionMode
        items={modeItems(v)}
        sessionName={v.session.name ?? "Sesión"}
        onToggleSet={(id, index) => day.toggleDone(id, index)}
        onSetValue={(id, index, field, raw) =>
          day.setDraftValue(id, index, field, raw)
        }
        onStep={(id, index, field, delta) =>
          day.stepValue(id, index, field, delta)
        }
        onToggleNoWeight={(id) => day.toggleNoWeight(id)}
        onToggleCardio={(id) => day.toggleCardioDone(id)}
        onCardioValue={day.setCardioValue}
        onCardioStep={stepCardio}
        onAddSet={(id) => day.addSet(id)}
        onRemoveSet={(id) => day.removeSet(id)}
        onCopySet={(id, index) => day.copyPrevious(id, index)}
        onExit={exitMode}
        onFinish={() => {
          setMode(false);
          day.close();
        }}
        canFinish={v.effort !== null}
        saving={v.pending}
        // El esfuerzo y la nota cierran la sesión, así que van aquí: es lo
        // último que se hace dentro del modo.
        finishControl={
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-center text-label-l text-on-surface-variant">
                Esfuerzo percibido
              </p>
              {v.effort === null && (
                <p className="text-center text-body-s text-on-surface-variant">
                  Elige cómo fue para poder cerrar la sesión.
                </p>
              )}
              <EffortDots effort={v.effort} onSelect={day.setEffort} />
            </div>
            <Field label="Nota de la sesión">
              {(a) => (
                <Textarea
                  {...a}
                  className="min-h-16"
                  value={v.note}
                  onChange={(e) => day.setNote(e.target.value)}
                />
              )}
            </Field>
          </div>
        }
      />
    );

  const progress = setsProgress(
    v.exercises.flatMap((ex) => ex.sets),
    v.cardio,
  );
  return (
    <div className="pb-8">
      <Header
        date={date}
        name={v.session.name ?? "Sesión"}
        logged={false}
        progress={progress}
      />
      {v.historyFailed && (
        <Alert tone="info" className="mb-3">
          No se pudo cargar el histórico de últimos pesos: el registro empezará
          sin esas marcas.
        </Alert>
      )}
      {v.submitError && <Alert className="mb-3">{v.submitError}</Alert>}
      <Button
        variant="tonal"
        className="mb-3 w-full"
        onClick={() => setMode(true)}
      >
        <PlayIcon />
        {v.editing ? "Editar" : "Empezar"}
      </Button>
      <SummaryRows rows={draftRows(v)} />
      {isSessionComplete(v.exercises, v.cardio) && (
        <div className="mt-3">
          <RewardSeal sets={progress.done} />
        </div>
      )}
    </div>
  );
}
