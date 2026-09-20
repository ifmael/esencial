// /sesion/:date — registro del día (wireframe pantalla-3). El estado planned es
// un borrador en memoria sobre los ejercicios de la sesión (fuerza y cardio);
// el estado logged es solo lectura desde GET /api/workout-logs/:date.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  cardClass,
  Input,
  Textarea,
} from "../components/ui";
import { ApiError, apiGet, apiSend } from "../lib/api";
import type { PlanSession, SessionExercise } from "../lib/plan-week";
import {
  defaultSetCount,
  formatLast,
  formatSetText,
  isValidDateStr,
  noteOrNull,
  numOrNull,
  parseDateEs,
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
    setCardioValue,
    toggleCardioDone,
    toggleExpand,
    close,
    reload: load,
  };
}

// --- Small presentational pieces --------------------------------------------

function Header({
  date,
  name,
  logged,
}: {
  date: string;
  name: string;
  logged: boolean;
}) {
  return (
    <header className="mb-6">
      <div className="mb-2 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Volver al día"
          className={buttonClass({
            variant: "secondary",
            className: "min-h-11 min-w-11",
          })}
        >
          ←
        </Link>
        <h1 className="text-2xl font-bold capitalize">
          {formatDateEs(parseDateEs(date))}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{name}</span>
        {logged && <Badge tone="done">Registrado</Badge>}
      </div>
    </header>
  );
}

function Stepper({
  label,
  value,
  step,
  onValue,
  onStep,
}: {
  label: string;
  value: number | null;
  step: number;
  onValue: (v: string) => void;
  onStep: (d: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label={`Reducir ${label}`}
        variant="secondary"
        className="min-h-11 min-w-11"
        onClick={() => onStep(-step)}
      >
        −
      </Button>
      <Input
        type="number"
        inputMode="decimal"
        aria-label={label}
        className="w-20 text-center"
        value={value === null ? "" : String(value)}
        onChange={(e) => onValue(e.target.value)}
      />
      <Button
        aria-label={`Aumentar ${label}`}
        variant="secondary"
        className="min-h-11 min-w-11"
        onClick={() => onStep(step)}
      >
        +
      </Button>
    </div>
  );
}

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
      className="flex justify-between gap-2"
    >
      {EFFORT_LABELS.map((label, i) => {
        const value = i + 1;
        const filled = effort !== null && effort >= value;
        return (
          <label
            key={value}
            className="flex min-h-11 flex-1 cursor-pointer flex-col items-center gap-1"
          >
            <span
              data-testid="effort-dot"
              data-filled={String(filled)}
              className={`min-h-11 min-w-11 rounded-full border-2 ${filled ? "border-primary bg-primary" : "border-border bg-surface"}`}
            />
            <span className="text-micro text-text-secondary">{label}</span>
            {onSelect && (
              <input
                type="radio"
                name="effort"
                aria-label={`Esfuerzo ${value}: ${label}`}
                className="sr-only"
                checked={effort === value}
                onChange={() => onSelect(value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

// --- Page ---------------------------------------------------------------------

export function SesionPage() {
  const { date = "" } = useParams<{ date: string }>();
  const day = useWorkoutDay(date);
  const { view } = day;

  if (view.kind === "invalid")
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Fecha no válida</h1>
        <Card className="text-text-secondary">
          La dirección debe terminar en una fecha con formato AAAA-MM-DD.
        </Card>
        <Link
          to="/"
          className={buttonClass({
            variant: "secondary",
            className: "self-start",
          })}
        >
          ← Volver al día
        </Link>
      </div>
    );

  if (view.kind === "empty")
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold capitalize">
          {isValidDateStr(date) ? formatDateEs(parseDateEs(date)) : "Día"}
        </h1>
        <Card className="text-text-secondary">
          Sin sesión asignada para este día.
        </Card>
        <Link
          to="/plan-fuerza"
          className={buttonClass({ className: "self-start" })}
        >
          Planificar en Plan fuerza
        </Link>
        <Link
          to="/"
          className={buttonClass({
            variant: "secondary",
            className: "self-start",
          })}
        >
          ← Volver al día
        </Link>
      </div>
    );

  if (view.kind === "error")
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Error</h1>
        <Card role="alert" className="text-error">
          {view.message}
        </Card>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => void day.reload()}
        >
          Reintentar
        </Button>
      </div>
    );

  if (view.kind === "loading")
    return (
      <Card className="text-text-secondary" role="status">
        Cargando…
      </Card>
    );

  if (view.kind === "logged") {
    const byExercise = view.log.sets.reduce<Record<number, SetLogItem[]>>(
      (acc, s) => {
        acc[s.planSessionExerciseId] ??= [];
        acc[s.planSessionExerciseId].push(s);
        return acc;
      },
      {},
    );
    return (
      <div>
        <Header
          date={date}
          name={view.log.session?.name ?? view.session?.name ?? "Sesión"}
          logged
        />
        <div className="flex flex-col gap-3">
          {Object.entries(byExercise).map(([seId, sets]) => (
            <section key={seId} className={cardClass()}>
              <h2 className="mb-2 font-semibold">{sets[0].exerciseName}</h2>
              <ul className="flex flex-col gap-1">
                {sets.map((s) => (
                  <li key={s.setIndex} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={
                        s.done ? "text-primary" : "text-text-secondary"
                      }
                    >
                      {s.done ? "✓" : "○"}
                    </span>
                    <span className="text-text-secondary">
                      Serie {s.setIndex + 1}
                    </span>
                    <span className="font-medium">{formatSetText(s)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {view.log.cardio.map((c) => (
            <section key={c.planSessionExerciseId} className={cardClass()}>
              <h2 className="mb-2 font-semibold">{c.exerciseName}</h2>
              <p className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={c.done ? "text-primary" : "text-text-secondary"}
                >
                  {c.done ? "✓" : "○"}
                </span>
                <span className="font-medium">
                  {c.distanceKm === null && c.durationMin === null
                    ? "Hecho sin marcas"
                    : `${c.distanceKm ?? "—"} km · ${c.durationMin ?? "—"} min`}
                </span>
              </p>
            </section>
          ))}
          <section className={cardClass("flex flex-col gap-3")}>
            <h2 className="font-semibold">Esfuerzo percibido</h2>
            <EffortDots effort={view.log.effort} />
            {view.log.note && (
              <p className="text-text-secondary">{view.log.note}</p>
            )}
          </section>
        </div>
      </div>
    );
  }

  // state A — editable draft
  const v = view;
  return (
    <div>
      <Header date={date} name={v.session.name ?? "Sesión"} logged={false} />
      {v.historyFailed && (
        <Card role="status" className="mb-3 text-pending-text">
          No se pudo cargar el histórico de últimos pesos; puedes registrarlo
          igualmente a mano.
        </Card>
      )}
      {v.submitError && (
        <Card role="alert" className="mb-3 text-error">
          {v.submitError}
        </Card>
      )}
      <div className="flex flex-col gap-3">
        {v.exercises.map((ex) => {
          const open = !!day.expanded[ex.se.id];
          const helper = formatLast(ex.last);
          return (
            <section key={ex.se.id} className={cardClass()}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/ejercicios/${ex.se.exerciseId}`}
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {ex.se.exerciseName}
                  </Link>
                  <Button
                    aria-label={`Series de ${ex.se.exerciseName}`}
                    variant="secondary"
                    className="min-h-11"
                    onClick={() => day.toggleExpand(ex.se.id)}
                  >
                    {open ? "Ocultar" : "Registrar series"}
                  </Button>
                  {helper && (
                    <span className="text-sm text-text-secondary">
                      {helper}
                    </span>
                  )}
                </div>
                {!open && (
                  <div className="flex gap-2">
                    {ex.sets.map((s, i) => (
                      <input
                        key={i}
                        type="checkbox"
                        aria-label={`${ex.se.exerciseName} serie ${i + 1}`}
                        className="min-h-11 min-w-11 accent-primary"
                        checked={s.done}
                        onChange={() => day.toggleDone(ex.se.id, i)}
                      />
                    ))}
                  </div>
                )}
              </div>
              {open && (
                <ul className="mt-3 flex flex-col gap-2">
                  {ex.sets.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-3">
                      <input
                        type="checkbox"
                        aria-label={`${ex.se.exerciseName} serie ${i + 1}`}
                        className="min-h-11 min-w-11 accent-primary"
                        checked={s.done}
                        onChange={() => day.toggleDone(ex.se.id, i)}
                      />
                      <span className="w-16 text-text-secondary">
                        Serie {i + 1}
                      </span>
                      <Stepper
                        label={`${ex.se.exerciseName} serie ${i + 1} (kg)`}
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
                        label={`${ex.se.exerciseName} serie ${i + 1} (reps)`}
                        value={s.reps}
                        step={1}
                        onValue={(val) =>
                          day.setDraftValue(ex.se.id, i, "reps", val)
                        }
                        onStep={(d) => day.stepValue(ex.se.id, i, "reps", d)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {v.cardio.map((c) => (
          <section key={c.se.id} className={cardClass()}>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={`/ejercicios/${c.se.exerciseId}`}
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                {c.se.exerciseName}
              </Link>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`${c.se.exerciseName} hecho`}
                  className="min-h-11 min-w-11 accent-primary"
                  checked={c.done}
                  onChange={() => day.toggleCardioDone(c.se.id)}
                />
                Hecho
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Stepper
                label={`${c.se.exerciseName} distancia (km)`}
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
                label={`${c.se.exerciseName} tiempo (min)`}
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
          </section>
        ))}

        <section className={cardClass("flex flex-col gap-3")}>
          <h2 className="font-semibold">Esfuerzo percibido</h2>
          <EffortDots effort={v.effort} onSelect={day.setEffort} />
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Nota</span>
            <Textarea
              aria-label="Nota de la sesión"
              className="min-h-24"
              value={v.note}
              onChange={(e) => day.setNote(e.target.value)}
            />
          </label>
          <Button
            className="min-h-11 disabled:opacity-50"
            disabled={v.effort === null || v.pending}
            onClick={day.close}
          >
            {v.pending ? "Cerrando…" : "Cerrar sesión"}
          </Button>
        </section>
      </div>
    </div>
  );
}
