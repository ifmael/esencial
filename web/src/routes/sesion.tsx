// E6 — /sesion/:date: mobile-first workout logging (wireframe pantalla-3).
// State A (planned) is an in-memory draft; state B (logged) is read-only from
// GET /api/workout-logs/:date. Reads compose existing endpoints only (D2).
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { apiGet, apiSend, ApiError } from "../lib/api";
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

type PlanSession = {
  id: number;
  date: string;
  status: string;
  templateId: number;
  templateName: string;
};

type TemplateExercise = {
  id: number;
  exerciseId: number;
  exerciseName: string;
  position: number;
  target_sets: number | null;
};

type LastValue = { weightKg: number; reps: number; date: string };

type SetLogItem = {
  templateExerciseId: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  done: boolean;
};

type LoggedDay = {
  date: string;
  effort: number;
  note: string | null;
  template: { id: number; name: string } | null;
  sets: (SetLogItem & { exerciseName: string })[];
};

// --- Draft model -------------------------------------------------------------

type DraftSet = { weightKg: number | null; reps: number | null; done: boolean };
type DraftExercise = {
  te: TemplateExercise;
  last: LastValue | null;
  sets: DraftSet[];
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
      const template = await apiGet<{ exercises: TemplateExercise[] }>(
        `/api/templates/${session.templateId}`,
      );
      const exercises = template.exercises.sort((a, b) => a.position - b.position);
      let historyFailed = false;
      const drafts: DraftExercise[] = await Promise.all(
        exercises.map(async (te) => {
          let last: LastValue | null = null;
          try {
            last = (await apiGet<{ last: LastValue | null }>(`/api/exercises/${te.exerciseId}/last`)).last;
          } catch {
            historyFailed = true;
          }
          return {
            te,
            last,
            sets: Array.from({ length: defaultSetCount(te.target_sets) }, () => ({
              weightKg: last?.weightKg ?? null,
              reps: last?.reps ?? null,
              done: false,
            })),
          };
        }),
      );
      setView({
        kind: "draft",
        session,
        exercises: drafts,
        historyFailed,
        effort: null,
        note: "",
        pending: false,
        submitError: null,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.error : "No se pudo cargar el día";
      setView({ kind: "error", message });
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchDraft = (patch: (v: Extract<View, { kind: "draft" }>) => Partial<Extract<View, { kind: "draft" }>>) =>
    setView((v) => (v.kind === "draft" ? { ...v, ...patch(v) } : v));

  const mutateSet = (
    teId: number,
    setIdx: number,
    patch: (s: DraftSet) => DraftSet,
  ) =>
    patchDraft((v) => ({
      exercises: v.exercises.map((ex) =>
        ex.te.id !== teId
          ? ex
          : { ...ex, sets: ex.sets.map((s, i) => (i === setIdx ? patch(s) : s)) },
      ),
    }));

  const setDraftValue = (teId: number, setIdx: number, field: "weightKg" | "reps", value: string) =>
    mutateSet(teId, setIdx, (s) => ({ ...s, [field]: numOrNull(value) }));

  const stepValue = (teId: number, setIdx: number, field: "weightKg" | "reps", delta: number) =>
    mutateSet(teId, setIdx, (s) => ({
      ...s,
      [field]: Math.max(0, (s[field] ?? 0) + delta),
    }));

  const toggleDone = (teId: number, setIdx: number) =>
    mutateSet(teId, setIdx, (s) => ({ ...s, done: !s.done }));

  const setEffort = (effort: number) => patchDraft(() => ({ effort }));
  const setNote = (note: string) => patchDraft(() => ({ note }));
  const toggleExpand = (teId: number) => setExpanded((m) => ({ ...m, [teId]: !m[teId] }));

  /** Cerrar sesión: single in-flight POST; 201→B, 409→refetch into B, 400→banner + draft. */
  const close = () => {
    setView((v) => {
      if (v.kind !== "draft" || v.effort === null || v.pending) return v;
      void (async () => {
        const payload = {
          effort: v.effort,
          note: noteOrNull(v.note),
          sets: v.exercises.flatMap((ex) =>
            ex.sets.map((s, i): SetLogItem => ({
              templateExerciseId: ex.te.id,
              setIndex: i,
              weightKg: s.weightKg,
              reps: s.reps,
              done: s.done,
            })),
          ),
        };
        try {
          const log = await apiSend<LoggedDay>(`/api/workout-logs/${date}`, "POST", payload);
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
          const field = err instanceof ApiError && err.field ? ` (${err.field})` : "";
          const message = err instanceof ApiError ? err.error : "No se pudo cerrar la sesión";
          patchDraft(() => ({ pending: false, submitError: `${message}${field}` }));
        }
      })();
      return { ...v, pending: true, submitError: null };
    });
  };

  return { view, expanded, setEffort, setNote, setDraftValue, stepValue, toggleDone, toggleExpand, close, reload: load };
}

// --- Small presentational pieces --------------------------------------------

function Header({ date, templateName, logged }: { date: string; templateName: string; logged: boolean }) {
  return (
    <header className="mb-6">
      <div className="mb-2 flex items-center gap-3">
        <Link to="/" aria-label="Volver al día" className="btn-secondary min-h-11 min-w-11">
          ←
        </Link>
        <h1 className="text-2xl font-bold capitalize">{formatDateEs(parseDateEs(date))}</h1>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{templateName}</span>
        {logged && <span className="badge-done">Registrado</span>}
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
      <button
        type="button"
        aria-label={`Reducir ${label}`}
        className="btn-secondary min-h-11 min-w-11"
        onClick={() => onStep(-step)}
      >
        −
      </button>
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        className="min-h-11 w-20 rounded-lg border border-border bg-surface px-2 text-center"
        value={value === null ? "" : String(value)}
        onChange={(e) => onValue(e.target.value)}
      />
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        className="btn-secondary min-h-11 min-w-11"
        onClick={() => onStep(step)}
      >
        +
      </button>
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
    <div role="radiogroup" aria-label="Esfuerzo percibido" className="flex justify-between gap-2">
      {EFFORT_LABELS.map((label, i) => {
        const value = i + 1;
        const filled = effort !== null && effort >= value;
        return (
          <label key={value} className="flex min-h-11 flex-1 cursor-pointer flex-col items-center gap-1">
            <span
              data-testid="effort-dot"
              data-filled={String(filled)}
              className={`min-h-11 min-w-11 rounded-full border-2 ${filled ? "border-primary bg-primary" : "border-border bg-surface"}`}
            />
            <span className="text-[10px] leading-tight text-text-secondary">{label}</span>
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
        <div className="card text-text-secondary">
          La dirección debe terminar en una fecha con formato AAAA-MM-DD.
        </div>
        <Link to="/" className="btn-secondary self-start">
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
        <div className="card text-text-secondary">Sin sesión asignada para este día.</div>
        <Link to="/plan-fuerza" className="btn-primary self-start">
          Planificar en Plan fuerza
        </Link>
        <Link to="/" className="btn-secondary self-start">
          ← Volver al día
        </Link>
      </div>
    );

  if (view.kind === "error")
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Error</h1>
        <div role="alert" className="card text-error">
          {view.message}
        </div>
        <button type="button" className="btn-secondary self-start" onClick={() => void day.reload()}>
          Reintentar
        </button>
      </div>
    );

  if (view.kind === "loading")
    return (
      <div className="card text-text-secondary" role="status">
        Cargando…
      </div>
    );

  if (view.kind === "logged")
    return (
      <div>
        <Header date={date} templateName={view.log.template?.name ?? view.session?.templateName ?? ""} logged />
        <div className="flex flex-col gap-3">
          {Object.entries(
            view.log.sets.reduce<Record<number, (SetLogItem & { exerciseName: string })[]>>((acc, s) => {
              (acc[s.templateExerciseId] ??= []).push(s);
              return acc;
            }, {}),
          ).map(([teId, sets]) => (
            <section key={teId} className="card">
              <h2 className="mb-2 font-semibold">{sets[0].exerciseName}</h2>
              <ul className="flex flex-col gap-1">
                {sets.map((s) => (
                  <li key={s.setIndex} className="flex items-center gap-3">
                    <span aria-hidden="true" className={s.done ? "text-primary" : "text-text-secondary"}>
                      {s.done ? "✓" : "○"}
                    </span>
                    <span className="text-text-secondary">Serie {s.setIndex + 1}</span>
                    <span className="font-medium">{formatSetText(s)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section className="card flex flex-col gap-3">
            <h2 className="font-semibold">Esfuerzo percibido</h2>
            <EffortDots effort={view.log.effort} />
            {view.log.note && <p className="text-text-secondary">{view.log.note}</p>}
          </section>
        </div>
      </div>
    );

  // state A — editable draft
  const v = view;
  return (
    <div>
      <Header date={date} templateName={v.session.templateName} logged={false} />
      {v.historyFailed && (
        <div role="status" className="card mb-3 text-pending-text">
          No se pudo cargar el histórico de últimos pesos; puedes registrarlo igualmente a mano.
        </div>
      )}
      {v.submitError && (
        <div role="alert" className="card mb-3 text-error">
          {v.submitError}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {v.exercises.map((ex) => {
          const open = !!day.expanded[ex.te.id];
          const helper = formatLast(ex.last);
          return (
            <section key={ex.te.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link to={`/ejercicio/${ex.te.exerciseId}`} className="font-semibold text-primary underline-offset-4 hover:underline">
                    {ex.te.exerciseName}
                  </Link>
                  <button
                    type="button"
                    aria-label={`Series de ${ex.te.exerciseName}`}
                    className="btn-secondary min-h-11"
                    onClick={() => day.toggleExpand(ex.te.id)}
                  >
                    {open ? "Ocultar" : "Registrar series"}
                  </button>
                  {helper && <span className="text-sm text-text-secondary">{helper}</span>}
                </div>
                {!open && (
                  <div className="flex gap-2">
                    {ex.sets.map((s, i) => (
                      <input
                        key={i}
                        type="checkbox"
                        aria-label={`${ex.te.exerciseName} serie ${i + 1}`}
                        className="min-h-11 min-w-11 accent-primary"
                        checked={s.done}
                        onChange={() => day.toggleDone(ex.te.id, i)}
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
                        aria-label={`${ex.te.exerciseName} serie ${i + 1}`}
                        className="min-h-11 min-w-11 accent-primary"
                        checked={s.done}
                        onChange={() => day.toggleDone(ex.te.id, i)}
                      />
                      <span className="w-16 text-text-secondary">Serie {i + 1}</span>
                      <Stepper
                        label={`${ex.te.exerciseName} serie ${i + 1} (kg)`}
                        value={s.weightKg}
                        step={2.5}
                        onValue={(val) => day.setDraftValue(ex.te.id, i, "weightKg", val)}
                        onStep={(d) => day.stepValue(ex.te.id, i, "weightKg", d)}
                      />
                      <Stepper
                        label={`${ex.te.exerciseName} serie ${i + 1} (reps)`}
                        value={s.reps}
                        step={1}
                        onValue={(val) => day.setDraftValue(ex.te.id, i, "reps", val)}
                        onStep={(d) => day.stepValue(ex.te.id, i, "reps", d)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        <section className="card flex flex-col gap-3">
          <h2 className="font-semibold">Esfuerzo percibido</h2>
          <EffortDots effort={v.effort} onSelect={day.setEffort} />
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Nota</span>
            <textarea
              aria-label="Nota de la sesión"
              className="min-h-24 rounded-lg border border-border bg-surface p-2"
              value={v.note}
              onChange={(e) => day.setNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-primary min-h-11 disabled:opacity-50"
            disabled={v.effort === null || v.pending}
            onClick={day.close}
          >
            {v.pending ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </section>
      </div>
    </div>
  );
}
