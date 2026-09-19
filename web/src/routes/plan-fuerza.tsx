// /plan-fuerza — rejilla semanal + editor del día (sesión) en modal. Cada día
// es una sesión con nombre, compuesta de ejercicios copiados desde plantillas
// (que se expanden y desaparecen) y/o sueltos, sin duplicados. El CRUD de
// plantillas vive en /plantillas.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { WeekGrid } from "../components/week-grid";
import { ApiError, apiGet, apiSend } from "../lib/api";
import {
  type Exercise,
  type ExerciseKind,
  KIND_LABELS,
  useExercises,
} from "../lib/exercises";
import { currentIsoWeek, shiftIsoWeek } from "../lib/iso-week";
import {
  type PlanSession,
  type SessionItem,
  type SessionPayload,
  usePlanWeek,
} from "../lib/plan-week";
import { intAt, numAt } from "../lib/template-draft";
import { type Template, useTemplates } from "../lib/templates";

// --- Editor del día (sesión) ------------------------------------------------

type DayRow = SessionItem & {
  key: string;
  exerciseId: number;
  exerciseName: string;
  kind: ExerciseKind;
};

function rowsFrom(session: PlanSession | null): DayRow[] {
  if (!session) return [];
  return session.exercises.map((e) => ({
    key: `e${e.id}`,
    exerciseId: e.exerciseId,
    exerciseName: e.exerciseName,
    kind: e.kind,
    targetSets: e.targetSets,
    targetRepsMin: e.targetRepsMin,
    targetRepsMax: e.targetRepsMax,
    targetDistanceKm: e.targetDistanceKm,
    targetDurationMin: e.targetDurationMin,
  }));
}

/** Expande una plantilla en filas del día: un ejercicio presente se queda UNA vez. */
function expandTemplate(
  template: Template,
  current: DayRow[],
): { rows: DayRow[]; skipped: number } {
  const rows = [...current];
  const taken = new Set(rows.map((r) => r.exerciseId));
  let skipped = 0;
  for (const e of template.exercises) {
    if (taken.has(e.exerciseId)) {
      skipped++;
      continue;
    }
    taken.add(e.exerciseId);
    rows.push({
      key: `t${template.id}-${e.id}`,
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      kind: e.kind,
      targetSets: e.kind === "strength" ? (e.targetSets ?? 3) : null,
      targetRepsMin: e.targetRepsMin,
      targetRepsMax: e.targetRepsMax,
      targetDistanceKm: e.targetDistanceKm,
      targetDurationMin: e.targetDurationMin,
    });
  }
  return { rows, skipped };
}

/** Aviso al expandir una plantilla: cuántos entran y cuántos ya estaban. */
function expandNote(added: number, skipped: number): string {
  const parts: string[] = [];
  if (added > 0)
    parts.push(`Añadidos ${added} ${added === 1 ? "ejercicio" : "ejercicios"}`);
  if (skipped > 0)
    parts.push(
      `${skipped} ${skipped === 1 ? "ejercicio ya estaba" : "ejercicios ya estaban"} en el día`,
    );
  return parts.join(" · ");
}

/** Modal de añadir al día: plantillas (se expanden) y ejercicios sueltos. */
function SessionPicker({
  templates,
  exercises,
  takenIds,
  note,
  templatesError,
  onRetryTemplates,
  onPickTemplate,
  onPickExercise,
  onClose,
}: {
  templates: Template[];
  exercises: Exercise[];
  takenIds: Set<number>;
  note: string | null;
  templatesError: string | null;
  onRetryTemplates: () => void;
  onPickTemplate: (t: Template) => void;
  onPickExercise: (e: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shownTemplates = needle
    ? templates.filter((t) => t.name.toLowerCase().includes(needle))
    : templates;
  const shownExercises = needle
    ? exercises.filter((e) => e.name.toLowerCase().includes(needle))
    : exercises;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Añadir al día"
        className="card flex max-h-[80vh] w-full max-w-md flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">Añadir al día</h2>
        <input
          type="text"
          autoFocus
          placeholder="Buscar plantilla o ejercicio…"
          aria-label="Buscar"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 rounded-lg border border-border px-3"
        />
        {note && (
          <p role="status" className="text-sm text-text-secondary">
            {note}
          </p>
        )}
        <section className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          <h3 className="font-semibold uppercase tracking-wide text-text-secondary">
            Plantillas
          </h3>
          {templatesError ? (
            <p className="text-sm text-error">
              {templatesError}{" "}
              <button className="underline" onClick={onRetryTemplates}>
                Reintentar
              </button>
            </p>
          ) : shownTemplates.length === 0 ? (
            <p className="text-sm text-text-secondary">Sin plantillas</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {shownTemplates.map((t) => {
                const done =
                  t.exercises.length > 0 &&
                  t.exercises.every((e) => takenIds.has(e.exerciseId));
                return (
                  <li key={t.id}>
                    <button
                      className="min-h-11 w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-surface-muted disabled:text-text-secondary"
                      disabled={done}
                      onClick={() => {
                        if (!done) onPickTemplate(t);
                      }}
                    >
                      {t.name}
                      <span className="ml-2 text-sm text-text-secondary">
                        {done
                          ? "ya añadida"
                          : `${t.exercises.length} ${
                              t.exercises.length === 1
                                ? "ejercicio"
                                : "ejercicios"
                            }`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          <h3 className="font-semibold uppercase tracking-wide text-text-secondary">
            Ejercicios
          </h3>
          {shownExercises.length === 0 ? (
            <p className="text-sm text-text-secondary">Sin ejercicios</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {shownExercises.map((e) => {
                const taken = takenIds.has(e.id);
                return (
                  <li key={e.id}>
                    <button
                      className="min-h-11 w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-surface-muted disabled:text-text-secondary"
                      disabled={taken}
                      onClick={() => {
                        if (!taken) onPickExercise(e);
                      }}
                    >
                      {e.name}
                      {e.kind === "strength"
                        ? null
                        : ` · ${KIND_LABELS[e.kind]}`}
                      {taken ? (
                        <span className="ml-2 text-sm">ya añadido</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <button className="btn-secondary self-end" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

/** Modal del día: nombre + ejercicios (series/reps o distancia/tiempo). */
function SessionEditor({
  date,
  session,
  templates,
  exercises,
  saving,
  serverError,
  templatesError,
  onRetryTemplates,
  onSave,
  onDelete,
  onCancel,
}: {
  date: string;
  session: PlanSession | null;
  templates: Template[];
  exercises: Exercise[];
  saving: boolean;
  serverError: string | null;
  templatesError: string | null;
  onRetryTemplates: () => void;
  onSave: (payload: SessionPayload) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(session?.name ?? "");
  const [rows, setRows] = useState<DayRow[]>(() => rowsFrom(session));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const takenIds = new Set(rows.map((r) => r.exerciseId));

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // Con el picker abierto, Escape lo cierra a él (su propio listener).
      if (ev.key === "Escape" && !pickerOpen) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, pickerOpen]);

  const patchRow = (key: string, patch: Partial<DayRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const pickTemplate = (t: Template) => {
    const { rows: next, skipped } = expandTemplate(t, rows);
    setRows(next);
    setNote(expandNote(next.length - rows.length, skipped));
    if (name.trim() === "") setName(t.name);
  };

  const pickExercise = (e: Exercise) => {
    if (takenIds.has(e.id)) return;
    setNote(null);
    setRows((rs) => [
      ...rs,
      {
        key: `x${e.id}`,
        exerciseId: e.id,
        exerciseName: e.name,
        kind: e.kind,
        targetSets: null,
        targetRepsMin: null,
        targetRepsMax: null,
        targetDistanceKm: null,
        targetDurationMin: null,
      },
    ]);
  };

  const save = () => {
    if (saving || rows.length === 0) return;
    onSave({
      name: name.trim() === "" ? null : name.trim(),
      items: rows.map((r) => ({
        exerciseId: r.exerciseId,
        targetSets: r.targetSets,
        targetRepsMin: r.targetRepsMin,
        targetRepsMax: r.targetRepsMax,
        targetDistanceKm: r.targetDistanceKm,
        targetDurationMin: r.targetDurationMin,
      })),
    });
  };

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-editor-title"
      className="card flex flex-col gap-3"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <h2 id="day-editor-title" className="text-lg font-bold">
          {session ? "Editar sesión" : "Nueva sesión"} · {date}
        </h2>
        <div className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <label htmlFor="day-name">Nombre</label>
          <input
            id="day-name"
            className="input"
            placeholder={`Sesión del ${date}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </header>

      {serverError && <p className="text-sm text-error">{serverError}</p>}

      <ul className="overflow-hidden rounded-lg border border-border bg-surface-muted/50">
        {rows.map((row, i) => (
          <li
            key={row.key}
            className={`flex flex-wrap items-center gap-2 bg-surface p-3 ${
              i < rows.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <span className="min-w-32 font-medium">{row.exerciseName}</span>
            {row.kind === "strength" ? (
              <>
                <label className="text-sm">
                  Series
                  <input
                    className="input w-16"
                    type="number"
                    min={1}
                    aria-label={`${row.exerciseName} series`}
                    value={row.targetSets ?? ""}
                    onChange={(e) =>
                      patchRow(row.key, { targetSets: intAt(e.target.value) })
                    }
                  />
                </label>
                <label className="text-sm">
                  Reps mín
                  <input
                    className="input w-16"
                    type="number"
                    min={1}
                    aria-label={`${row.exerciseName} reps mín`}
                    value={row.targetRepsMin ?? ""}
                    onChange={(e) =>
                      patchRow(row.key, {
                        targetRepsMin: intAt(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  Reps máx
                  <input
                    className="input w-16"
                    type="number"
                    min={1}
                    aria-label={`${row.exerciseName} reps máx`}
                    value={row.targetRepsMax ?? ""}
                    onChange={(e) =>
                      patchRow(row.key, {
                        targetRepsMax: intAt(e.target.value),
                      })
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <span className="badge-pending">{KIND_LABELS[row.kind]}</span>
                <label className="text-sm">
                  Distancia (km)
                  <input
                    className="input w-20"
                    type="number"
                    min={0}
                    step="0.1"
                    aria-label={`${row.exerciseName} distancia (km)`}
                    value={row.targetDistanceKm ?? ""}
                    onChange={(e) =>
                      patchRow(row.key, {
                        targetDistanceKm: numAt(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  Tiempo (min)
                  <input
                    className="input w-20"
                    type="number"
                    min={0}
                    aria-label={`${row.exerciseName} tiempo (min)`}
                    value={row.targetDurationMin ?? ""}
                    onChange={(e) =>
                      patchRow(row.key, {
                        targetDurationMin: intAt(e.target.value),
                      })
                    }
                  />
                </label>
              </>
            )}
            <button
              className="btn-secondary ml-auto"
              aria-label={`Quitar ${row.exerciseName}`}
              onClick={() =>
                setRows((rs) => rs.filter((r) => r.key !== row.key))
              }
            >
              Quitar
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="bg-surface p-3 text-text-secondary">
            Sin ejercicios todavía. Añade una plantilla o ejercicios sueltos.
          </li>
        )}
      </ul>

      <button
        className="btn-secondary self-start"
        onClick={() => {
          setNote(null);
          setPickerOpen(true);
        }}
      >
        + Añadir
      </button>

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={saving || rows.length === 0}
          onClick={save}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        {session &&
          (confirming ? (
            <span className="flex items-center gap-2">
              <span>¿Eliminar la sesión completa?</span>
              <button className="btn-primary bg-error" onClick={onDelete}>
                Confirmar
              </button>
              <button
                className="btn-secondary"
                onClick={() => setConfirming(false)}
              >
                No
              </button>
            </span>
          ) : (
            <button
              className="btn-secondary"
              onClick={() => setConfirming(true)}
            >
              Eliminar sesión
            </button>
          ))}
      </div>

      {pickerOpen && (
        <SessionPicker
          templates={templates}
          exercises={exercises}
          takenIds={takenIds}
          note={note}
          templatesError={templatesError}
          onRetryTemplates={onRetryTemplates}
          onPickTemplate={pickTemplate}
          onPickExercise={pickExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}

// --- Page ------------------------------------------------------------------

export function PlanFuerzaPage() {
  const {
    templates,
    error: templatesError,
    reload: reloadTemplates,
  } = useTemplates();
  const [day, setDay] = useState<{
    date: string;
    session: PlanSession | null;
  } | null>(null);
  const [daySaving, setDaySaving] = useState(false);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const { exercises } = useExercises();
  const [params, setParams] = useSearchParams();
  const isoWeek = params.get("week") ?? currentIsoWeek();
  const gotoWeek = (week: string) => setParams({ week });
  const week = usePlanWeek(isoWeek);

  /** Abre (o crea) el editor del día; el detalle se carga por HTTP. */
  const openDay = async (date: string) => {
    setDayError(null);
    const found = week.sessions.find((s) => s.date === date);
    if (!found || found.status === "logged") {
      setDay({ date, session: null });
      return;
    }
    setDayLoading(true);
    try {
      const detail = await apiGet<PlanSession>(
        `/api/plan-sessions/${found.id}`,
      );
      setDay({ date, session: detail });
    } catch (e) {
      setDay(null);
      setDayError(
        e instanceof Error ? e.message : "No se pudo cargar la sesión",
      );
    } finally {
      setDayLoading(false);
    }
  };

  const saveDay = async (payload: SessionPayload) => {
    if (!day || daySaving) return;
    setDaySaving(true);
    setDayError(null);
    try {
      if (day.session) {
        await apiSend(`/api/plan-sessions/${day.session.id}`, "PUT", payload);
      } else {
        await apiSend("/api/plan-sessions", "POST", {
          date: day.date,
          ...payload,
        });
      }
      await week.reload();
      setDay(null);
    } catch (e) {
      setDayError(
        e instanceof ApiError ? e.error : "No se pudo guardar la sesión",
      );
    } finally {
      setDaySaving(false);
    }
  };

  const deleteDay = async () => {
    if (!day?.session) return;
    setDaySaving(true);
    setDayError(null);
    try {
      await apiSend(`/api/plan-sessions/${day.session.id}`, "DELETE", {});
      await week.reload();
      setDay(null);
    } catch (e) {
      setDayError(
        e instanceof ApiError ? e.error : "No se pudo eliminar la sesión",
      );
    } finally {
      setDaySaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <section className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Plan fuerza</h1>
        <Link to="/ejercicios" className="btn-secondary">
          Ejercicios
        </Link>
        <Link to="/plantillas" className="btn-secondary">
          Plantillas
        </Link>
      </section>

      <WeekGrid
        isoWeek={isoWeek}
        sessions={week.sessions}
        loading={week.loading}
        error={week.error}
        onShiftWeek={(d) => gotoWeek(shiftIsoWeek(isoWeek, d))}
        onOpenDay={(date) => void openDay(date)}
        onRemove={(id) => void week.remove(id)}
      />

      {dayLoading && <div className="card">Cargando sesión…</div>}

      {day && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDay(null);
          }}
        >
          <div className="my-8 w-full max-w-2xl">
            <SessionEditor
              key={`${day.date}-${day.session?.id ?? "nueva"}`}
              date={day.date}
              session={day.session}
              templates={templates}
              exercises={exercises}
              saving={daySaving}
              serverError={dayError}
              templatesError={templatesError}
              onRetryTemplates={reloadTemplates}
              onSave={(payload) => void saveDay(payload)}
              onDelete={() => void deleteDay()}
              onCancel={() => setDay(null)}
            />
          </div>
        </div>
      )}

      {dayError && !day && <div className="card text-error">{dayError}</div>}
    </div>
  );
}
