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
  ChevronDownIcon,
  CopyIcon,
  EditIcon,
  PlayIcon,
  RunIcon,
} from "../components/icons";
import { type ModeItem, SessionMode } from "../components/session-mode";
import { Stepper } from "../components/stepper";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  Chain,
  Checkbox,
  cx,
  Field,
  ScrollStrip,
  Switch,
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
import { type ExerciseMetric, targetSummary } from "../lib/exercises";
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
 *  con sus series y marcas, cardio con su «Hecho» — para ir uno a uno. */
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
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
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

  /** «Editar» un registro: el mismo borrador, precargado con lo registrado. Parte
   * plegado: lo desplegado al registrar ya no corresponde a este borrador. */
  const startEdit = () => {
    if (view.kind !== "logged" || !view.session) return;
    const { session, log } = view;
    setExpanded({});
    setView({ kind: "loading" });
    buildDraft(date, session, sessionsRef.current, log).then(setView, (err) =>
      setView(loadError(err)),
    );
  };

  const cancelEdit = () =>
    setView((v) =>
      v.kind === "draft" && v.editing
        ? { kind: "logged", session: v.session, log: v.editing }
        : v,
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

  const completeExercise = (seId: number) =>
    patchDraft((v) => ({
      exercises: v.exercises.map((ex) => {
        if (ex.se.id !== seId) return ex;
        const fields = setFields(ex.metric, ex.noWeight);
        return {
          ...ex,
          sets: ex.sets.map((s) => ({
            ...s,
            done: s.done || isSetFilled(s, fields),
          })),
        };
      }),
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
    expanded,
    setEffort,
    setNote,
    setDraftValue,
    stepValue,
    toggleDone,
    copyPrevious,
    toggleNoWeight,
    addSet,
    removeSet,
    completeExercise,
    setCardioValue,
    toggleCardioDone,
    toggleExpand,
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

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="flex flex-col">
    <span className="text-display-s text-e tabular">{value}</span>
    <span className="text-label-m">{label}</span>
  </div>
);

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
  // Identidad estable: el modo la usa como dependencia del efecto de Escape.
  const exitMode = useCallback(() => setMode(false), []);

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
    // El registro no guarda la cadena; sí el plan del día (`view.session`), y
    // los sets llegan en su orden (`position`), así que los bloques salen de ahí.
    const entries = Object.entries(byExercise);
    const planned = view.session?.exercises ?? [];
    const groups = blocks(
      entries.map(([seId]) => {
        const se = planned.find((e) => e.id === Number(seId));
        return {
          superset: se?.superset ?? false,
          kind: se?.kind ?? "strength",
        };
      }),
    );
    return (
      <div className="pb-8">
        <Header
          date={date}
          name={log.session?.name ?? view.session?.name ?? "Sesión"}
          logged
        />
        {view.session && (
          <Button variant="tonal" className="mb-4" onClick={day.startEdit}>
            <EditIcon width={20} height={20} /> Editar
          </Button>
        )}
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
        <ul className="stagger flex flex-col gap-3">
          {/* Cada bloque en su contenedor, con la caja cuando el día venía
              encadenado: el registro se lee igual que se hizo. */}
          {groups.map((block, bi) => {
            const card = (i: number) => {
              const [seId, sets] = entries[i];
              return (
                <li key={seId}>
                  <Card className="flex flex-col gap-2">
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
                </li>
              );
            };
            return (
              <Chain
                key={`c${entries[block[0]][0]}`}
                label={block.length > 1 ? blockLabel(block.length) : undefined}
                style={{ ["--i" as string]: bi }}
              >
                {block.map(card)}
              </Chain>
            );
          })}
          {log.cardio.map((c, i) => (
            <li
              key={c.planSessionExerciseId}
              style={{ ["--i" as string]: groups.length + i }}
            >
              <Card className="flex flex-col gap-2">
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
            </li>
          ))}
          <li style={{ ["--i" as string]: groups.length + log.cardio.length }}>
            <Card className="flex flex-col gap-3">
              <h2 className="text-title-m">Esfuerzo percibido</h2>
              <EffortDots effort={log.effort} />
              {log.note && (
                <p className="rounded-m bg-surface-container-high p-3 text-body-l">
                  {log.note}
                </p>
              )}
            </Card>
          </li>
        </ul>
      </div>
    );
  }

  // state A — editable draft
  const v = view;

  // Modo interactivo: ocupa la pantalla y sustituye la página; el borrador
  // sigue debajo, intacto («Salir» vuelve a él y «Terminar» es «Guardar»).
  if (mode)
    return (
      <SessionMode
        items={modeItems(v)}
        onToggleSet={(id, index) => day.toggleDone(id, index)}
        onSetValue={(id, index, field, raw) =>
          day.setDraftValue(id, index, field, raw)
        }
        onStep={(id, index, field, delta) =>
          day.stepValue(id, index, field, delta)
        }
        onToggleNoWeight={(id) => day.toggleNoWeight(id)}
        onToggleCardio={(id) => day.toggleCardioDone(id)}
        onExit={exitMode}
        onFinish={() => {
          setMode(false);
          day.close();
        }}
        canFinish={v.effort !== null}
        saving={v.pending}
        finishControl={
          <div className="flex flex-col gap-2">
            <p className="text-center text-label-l text-on-surface-variant">
              Esfuerzo percibido
            </p>
            <EffortDots effort={v.effort} onSelect={day.setEffort} />
          </div>
        }
      />
    );

  const progress = setsProgress(
    v.exercises.flatMap((ex) => ex.sets),
    v.cardio,
  );
  const complete = isSessionComplete(v.exercises, v.cardio);
  const openPending = v.exercises.find(
    (ex) =>
      day.expanded[ex.se.id] &&
      ex.sets.some(
        (s) => !s.done && isSetFilled(s, setFields(ex.metric, ex.noWeight)),
      ),
  );
  // Los bloques del día (encadenados) y su orden: agrupan las tarjetas y dan el
  // turno del escalonado.
  const groups = blocks(v.exercises.map((ex) => ex.se));
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
      <Button
        variant="tonal"
        className="mb-3 w-full"
        onClick={() => setMode(true)}
      >
        <PlayIcon />
        Empezar
      </Button>
      <ul className="stagger flex flex-col gap-3">
        {/* Cada bloque en su contenedor, con la caja cuando encadena más de un
            miembro: montar el día y registrarlo se leen igual. */}
        {groups.map((block, bi) => {
          const card = (idx: number) => {
            const ex = v.exercises[idx];
            const open = !!day.expanded[ex.se.id];
            const helper = ex.previous ?? formatLast(ex.last);
            const allDone = ex.sets.every((s) => s.done);
            const fields = setFields(ex.metric, ex.noWeight);
            return (
              <li key={ex.se.id}>
                <Card className={doneCard(allDone)}>
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
                    {/* En móvil, «Sin peso» y «Registrar series» caen juntos a una
                    línea propia: van centrados, porque el resto de la tarjeta
                    (la marca, el nombre y la tira de casillas) empieza en el
                    margen izquierdo y el par quedaba pegado al borde derecho.
                    Desde `sm` la fila lleva también la tira y va al final, como
                    el resto de cabeceras M3. */}
                    <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-1 sm:w-auto sm:flex-1 sm:justify-end">
                      {/* «Sin peso» solo tiene sentido donde el kg es opcional
                      (`weight_reps`): en `reps`/`time` no hay kilos y en
                      `weight_time` la carga es parte del ejercicio. */}
                      {ex.metric === "weight_reps" && (
                        <span className="flex shrink-0 items-center gap-2 pr-2 text-label-l">
                          <Switch
                            aria-label={`Sin peso · ${ex.se.exerciseName}`}
                            checked={ex.noWeight}
                            onChange={() => day.toggleNoWeight(ex.se.id)}
                          />
                          Sin peso
                        </span>
                      )}
                      {!open && (
                        // Una sola línea: en móvil se lleva la suya (ancho completo)
                        // y a partir de `sm` solo cae a otra si no cabe. El borde
                        // desvanecido avisa de que hay más series.
                        <ScrollStrip className="order-last flex w-full min-w-0 items-center gap-1 sm:order-none sm:w-auto">
                          {ex.sets.map((s, i) => (
                            <Checkbox
                              key={i}
                              className="shrink-0"
                              aria-label={`${ex.se.exerciseName} serie ${i + 1}`}
                              checked={s.done}
                              disabled={!s.done && !isSetFilled(s, fields)}
                              onChange={() => day.toggleDone(ex.se.id, i)}
                            />
                          ))}
                        </ScrollStrip>
                      )}
                      <Button
                        aria-label={`Series de ${ex.se.exerciseName}`}
                        aria-expanded={open}
                        variant="tonal"
                        size="sm"
                        className="shrink-0"
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
                    <>
                      <ul className="stagger mt-3 flex flex-col gap-2">
                        {ex.sets.map((s, i) => {
                          const ctx = `${ex.se.exerciseName} serie ${i + 1}`;
                          // La homóloga de la sesión anterior: solo si la hubo.
                          const prev = ex.prevSets[i] ?? null;
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
                                  disabled={!s.done && !isSetFilled(s, fields)}
                                  onChange={() => day.toggleDone(ex.se.id, i)}
                                />
                                <span className="w-14 text-label-l text-on-surface-variant">
                                  Serie {i + 1}
                                </span>
                                {prev && (
                                  // El valor de la serie homóloga y, a la vez, el
                                  // botón que la copia (sus marcas, sin marcar).
                                  <Button
                                    variant="text"
                                    size="md"
                                    className="tabular shrink-0"
                                    aria-label={`Copiar ${formatSetText(prev)} de la sesión anterior a ${ctx}`}
                                    onClick={() =>
                                      day.copyPrevious(ex.se.id, i)
                                    }
                                  >
                                    <CopyIcon width={18} height={18} />
                                    {formatSetText(prev)}
                                  </Button>
                                )}
                              </div>
                              <div
                                className={cx(
                                  "grid flex-1 gap-3",
                                  fields.weight && (fields.reps || fields.time)
                                    ? "grid-cols-2"
                                    : "grid-cols-1",
                                )}
                              >
                                {fields.weight && (
                                  <Stepper
                                    caption="Peso (kg)"
                                    context={ctx}
                                    value={s.weightKg}
                                    step={2.5}
                                    onValue={(val) =>
                                      day.setDraftValue(
                                        ex.se.id,
                                        i,
                                        "weightKg",
                                        val,
                                      )
                                    }
                                    onStep={(d) =>
                                      day.stepValue(ex.se.id, i, "weightKg", d)
                                    }
                                  />
                                )}
                                {fields.reps && (
                                  <Stepper
                                    caption="Reps"
                                    context={ctx}
                                    value={s.reps}
                                    step={1}
                                    onValue={(val) =>
                                      day.setDraftValue(
                                        ex.se.id,
                                        i,
                                        "reps",
                                        val,
                                      )
                                    }
                                    onStep={(d) =>
                                      day.stepValue(ex.se.id, i, "reps", d)
                                    }
                                  />
                                )}
                                {fields.time && (
                                  <Stepper
                                    caption="Segundos"
                                    context={ctx}
                                    value={s.durationSecs}
                                    step={5}
                                    onValue={(val) =>
                                      day.setDraftValue(
                                        ex.se.id,
                                        i,
                                        "durationSecs",
                                        val,
                                      )
                                    }
                                    onStep={(d) =>
                                      day.stepValue(
                                        ex.se.id,
                                        i,
                                        "durationSecs",
                                        d,
                                      )
                                    }
                                  />
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          variant="tonal"
                          aria-label={`Quitar serie a ${ex.se.exerciseName}`}
                          disabled={ex.sets.length <= MIN_SETS}
                          onClick={() => day.removeSet(ex.se.id)}
                        >
                          − Quitar serie
                        </Button>
                        <Button
                          variant="tonal"
                          aria-label={`Añadir serie a ${ex.se.exerciseName}`}
                          disabled={ex.sets.length >= MAX_SETS}
                          onClick={() => day.addSet(ex.se.id)}
                        >
                          + Añadir serie
                        </Button>
                      </div>
                    </>
                  )}
                </Card>
              </li>
            );
          };
          return (
            <Chain
              key={`c${v.exercises[block[0]].se.id}`}
              label={block.length > 1 ? blockLabel(block.length) : undefined}
              style={{ ["--i" as string]: bi }}
            >
              {block.map(card)}
            </Chain>
          );
        })}

        {v.cardio.map((c, i) => {
          const Icon = c.se.kind === "bike" ? BikeIcon : RunIcon;
          return (
            <li key={c.se.id} style={{ ["--i" as string]: groups.length + i }}>
              <Card className={doneCard(c.done)}>
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
            </li>
          );
        })}

        {/* Justo tras la última fila: donde está la vista al marcarla. */}
        {complete && (
          <li>
            <RewardSeal sets={progress.done} />
          </li>
        )}

        <li style={{ ["--i" as string]: groups.length + v.cardio.length }}>
          <Card className="flex flex-col gap-4">
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
        </li>
      </ul>

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
        {v.editing && (
          <Button variant="text" disabled={v.pending} onClick={day.cancelEdit}>
            Cancelar
          </Button>
        )}
        <Button disabled={v.effort === null || v.pending} onClick={day.close}>
          {v.editing
            ? v.pending
              ? "Guardando…"
              : "Guardar"
            : v.pending
              ? "Cerrando…"
              : "Cerrar sesión"}
        </Button>
      </div>
    </div>
  );
}
