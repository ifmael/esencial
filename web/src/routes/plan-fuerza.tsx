// /plan-fuerza — rejilla semanal + editor del día (sesión) en un único modal:
// lateral con lo ya añadido al día y selector de plantillas/ejercicios. Cada día
// es una sesión con nombre, compuesta de ejercicios copiados desde plantillas
// (que se expanden y desaparecen) y/o sueltos, sin duplicados. El CRUD de
// plantillas vive en /plantillas.
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { GroupedExercises } from "../components/grouped-exercises";
import {
  DRAG_INSTRUCTIONS,
  GripIcon,
  sortableAnnouncements,
  useDragSensors,
} from "../components/sortable";
import { Badge, Button, Card, Input } from "../components/ui";
import { WeekGrid } from "../components/week-grid";
import { ApiError, apiGet, apiSend } from "../lib/api";
import {
  type Exercise,
  type ExerciseKind,
  KIND_LABELS,
  targetSummary,
  useExercises,
} from "../lib/exercises";
import { currentIsoWeek, shiftIsoWeek } from "../lib/iso-week";
import {
  type PlanSession,
  type SessionExercise,
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

/** Selector del día: plantillas (se expanden) y ejercicios sueltos. */
function DayPicker({
  templates,
  exercises,
  takenIds,
  note,
  templatesError,
  onRetryTemplates,
  onPickTemplate,
  onPickExercise,
}: {
  templates: Template[];
  exercises: Exercise[];
  takenIds: Set<number>;
  note: string | null;
  templatesError: string | null;
  onRetryTemplates: () => void;
  onPickTemplate: (t: Template) => void;
  onPickExercise: (e: Exercise) => void;
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
    <section aria-label="Añadir al día" className="flex min-h-0 flex-col gap-2">
      <h3 className="font-semibold uppercase tracking-wide text-text-secondary">
        Añadir al día
      </h3>
      <Input
        type="text"
        autoFocus
        placeholder="Buscar plantilla o ejercicio…"
        aria-label="Buscar"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {note && (
        <p role="status" className="text-body text-text-secondary">
          {note}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <section className="flex flex-col gap-1">
          <h4 className="font-semibold uppercase tracking-wide text-text-secondary">
            Plantillas
          </h4>
          {templatesError ? (
            <p className="text-body text-error">
              {templatesError}{" "}
              <button className="underline" onClick={onRetryTemplates}>
                Reintentar
              </button>
            </p>
          ) : shownTemplates.length === 0 ? (
            <p className="text-body text-text-secondary">Sin plantillas</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {shownTemplates.map((t) => {
                const done =
                  t.exercises.length > 0 &&
                  t.exercises.every((e) => takenIds.has(e.exerciseId));
                return (
                  <li key={t.id}>
                    <button
                      className="min-h-11 w-full rounded-control px-3 py-2 text-left font-medium hover:bg-surface-muted disabled:text-text-secondary"
                      disabled={done}
                      onClick={() => {
                        if (!done) onPickTemplate(t);
                      }}
                    >
                      {t.name}
                      <span className="ml-2 text-body text-text-secondary">
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
        <section className="flex flex-col gap-1">
          <h4 className="font-semibold uppercase tracking-wide text-text-secondary">
            Ejercicios
          </h4>
          {shownExercises.length === 0 ? (
            <p className="text-body text-text-secondary">Sin ejercicios</p>
          ) : (
            <GroupedExercises
              exercises={shownExercises}
              forceOpen={needle !== ""}
              listClassName="flex flex-col gap-1"
              renderItem={(e) => {
                const taken = takenIds.has(e.id);
                return (
                  <li key={e.id}>
                    <button
                      className="min-h-11 w-full rounded-control px-3 py-2 text-left font-medium hover:bg-surface-muted disabled:text-text-secondary"
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
                        <span className="ml-2 text-body">ya añadido</span>
                      ) : null}
                    </button>
                  </li>
                );
              }}
            />
          )}
        </section>
      </div>
    </section>
  );
}

/** Fila arrastrable del día: el asa cambia el orden (ratón, táctil o teclado). */
function DayRowItem({
  row,
  onPatch,
  onRemove,
}: {
  row: DayRow;
  onPatch: (key: string, patch: Partial<DayRow>) => void;
  onRemove: (key: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.key });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-2 bg-surface p-3 ${
        isDragging ? "relative z-10 opacity-70" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded-control p-1 text-text-secondary hover:bg-surface-muted active:cursor-grabbing"
        aria-label={`Mover ${row.exerciseName}`}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <span className="min-w-32 font-medium">{row.exerciseName}</span>
      {row.kind === "strength" ? (
        <>
          <label className="text-body">
            Series
            <Input
              className="w-16"
              type="number"
              min={1}
              aria-label={`${row.exerciseName} series`}
              value={row.targetSets ?? ""}
              onChange={(e) =>
                onPatch(row.key, { targetSets: intAt(e.target.value) })
              }
            />
          </label>
          <label className="text-body">
            Reps mín
            <Input
              className="w-16"
              type="number"
              min={1}
              aria-label={`${row.exerciseName} reps mín`}
              value={row.targetRepsMin ?? ""}
              onChange={(e) =>
                onPatch(row.key, { targetRepsMin: intAt(e.target.value) })
              }
            />
          </label>
          <label className="text-body">
            Reps máx
            <Input
              className="w-16"
              type="number"
              min={1}
              aria-label={`${row.exerciseName} reps máx`}
              value={row.targetRepsMax ?? ""}
              onChange={(e) =>
                onPatch(row.key, { targetRepsMax: intAt(e.target.value) })
              }
            />
          </label>
        </>
      ) : (
        <>
          <Badge tone="pending">{KIND_LABELS[row.kind]}</Badge>
          <label className="text-body">
            Distancia (km)
            <Input
              className="w-20"
              type="number"
              min={0}
              step="0.1"
              aria-label={`${row.exerciseName} distancia (km)`}
              value={row.targetDistanceKm ?? ""}
              onChange={(e) =>
                onPatch(row.key, { targetDistanceKm: numAt(e.target.value) })
              }
            />
          </label>
          <label className="text-body">
            Tiempo (min)
            <Input
              className="w-20"
              type="number"
              min={0}
              aria-label={`${row.exerciseName} tiempo (min)`}
              value={row.targetDurationMin ?? ""}
              onChange={(e) =>
                onPatch(row.key, { targetDurationMin: intAt(e.target.value) })
              }
            />
          </label>
        </>
      )}
      <Button
        variant="secondary"
        className="ml-auto"
        aria-label={`Quitar ${row.exerciseName}`}
        onClick={() => onRemove(row.key)}
      >
        Quitar
      </Button>
    </li>
  );
}

/** Modal único del día: lateral con lo añadido + selector para sumar más. */
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
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const takenIds = new Set(rows.map((r) => r.exerciseId));
  const sensors = useDragSensors();

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // Escape cancela el arrastre de teclado (dnd-kit marca el evento como
      // gestionado); solo cerramos el modal si nadie lo consumió antes.
      if (ev.key === "Escape" && !ev.defaultPrevented) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const nameOf = (id: UniqueIdentifier) =>
    rows.find((r) => r.key === id)?.exerciseName ?? "";

  const announcements = sortableAnnouncements(
    nameOf,
    (id) => rows.findIndex((r) => r.key === id) + 1,
  );

  /** El orden de `rows` es el que viaja en `items[]`: reordenar ya es guardar. */
  const moveRow = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setRows((rs) => {
      const from = rs.findIndex((r) => r.key === active.id);
      const to = rs.findIndex((r) => r.key === over.id);
      return from === -1 || to === -1 ? rs : arrayMove(rs, from, to);
    });
  };

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
    <Card
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-editor-title"
      className="flex max-h-[85vh] flex-col gap-3"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <h2 id="day-editor-title" className="text-lead font-semibold">
          {session ? "Editar sesión" : "Nueva sesión"} · {date}
        </h2>
        <div className="flex min-w-48 flex-1 flex-col gap-1 text-body">
          <label htmlFor="day-name">Nombre</label>
          <Input
            id="day-name"
            placeholder={`Sesión del ${date}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </header>

      {serverError && <p className="text-body text-error">{serverError}</p>}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-rows-1">
        <section className="flex min-h-0 flex-col gap-2">
          <h3 className="font-semibold uppercase tracking-wide text-text-secondary">
            Ejercicios del día
          </h3>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={moveRow}
            accessibility={{
              screenReaderInstructions: DRAG_INSTRUCTIONS,
              announcements,
            }}
          >
            <SortableContext
              items={rows.map((r) => r.key)}
              strategy={verticalListSortingStrategy}
            >
              <ul
                aria-label="Ejercicios del día"
                className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-control border border-border bg-surface-muted/50"
              >
                {rows.map((row) => (
                  <DayRowItem
                    key={row.key}
                    row={row}
                    onPatch={patchRow}
                    onRemove={(key) =>
                      setRows((rs) => rs.filter((r) => r.key !== key))
                    }
                  />
                ))}
                {rows.length === 0 && (
                  <li className="bg-surface p-3 text-text-secondary">
                    Sin ejercicios todavía. Añade una plantilla o ejercicios
                    sueltos.
                  </li>
                )}
              </ul>
            </SortableContext>
          </DndContext>
        </section>

        <DayPicker
          templates={templates}
          exercises={exercises}
          takenIds={takenIds}
          note={note}
          templatesError={templatesError}
          onRetryTemplates={onRetryTemplates}
          onPickTemplate={pickTemplate}
          onPickExercise={pickExercise}
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button disabled={saving || rows.length === 0} onClick={save}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        {session &&
          (confirming ? (
            <span className="flex items-center gap-2">
              <span>¿Eliminar la sesión completa?</span>
              <Button variant="danger" onClick={onDelete}>
                Confirmar
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                No
              </Button>
            </span>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Eliminar sesión
            </Button>
          ))}
      </div>
    </Card>
  );
}

// --- Celdas de la rejilla ----------------------------------------------------

/** Fila de la celda: asa (días planned) + nombre + info del objetivo. La ✕
 *  desprograma el ejercicio: la fila se convierte en su propio «¿Quitar?» con
 *  Confirmar/Cancelar, sin abrir el editor del día. */
function CellRow({
  exercise,
  sortable,
  removable,
  onRemove,
}: {
  exercise: SessionExercise;
  sortable: boolean;
  removable: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exercise.exerciseId, disabled: !sortable });
  const [confirming, setConfirming] = useState(false);
  const info = targetSummary(exercise);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-h-11 flex-1 items-center gap-1.5 rounded-panel bg-surface-muted px-2 py-2 ${
        isDragging ? "relative z-10 opacity-70" : ""
      }`}
    >
      {confirming ? (
        <>
          {/* Una sola línea: la columna mide ~152px y dos botones anchos se
              salían de la fila (tapaban el día siguiente). El nombre trunca. */}
          <span
            className="min-w-0 flex-1 truncate text-caption text-text-secondary"
            title={exercise.exerciseName}
          >
            {exercise.exerciseName}
          </span>
          <Button
            size="sm"
            variant="danger"
            className="min-h-11 shrink-0"
            aria-label={`Confirmar quitar ${exercise.exerciseName}`}
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
              onRemove();
            }}
          >
            Sí
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="min-h-11 shrink-0"
            aria-label={`Cancelar quitar ${exercise.exerciseName}`}
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
            }}
          >
            No
          </Button>
        </>
      ) : (
        <>
          {sortable ? (
            <button
              type="button"
              className="cursor-grab touch-none text-text-secondary hover:text-primary active:cursor-grabbing"
              aria-label={`Mover ${exercise.exerciseName}`}
              onClick={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <GripIcon />
            </button>
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="line-clamp-2 text-body text-text">
              {exercise.exerciseName}
            </span>
            {info ? (
              <span className="text-caption text-text-secondary">{info}</span>
            ) : null}
          </span>
          {removable ? (
            <button
              type="button"
              className="min-h-11 px-1 text-caption text-text-secondary hover:text-error"
              aria-label={`Desprogramar ${exercise.exerciseName}`}
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
            >
              ✕
            </button>
          ) : null}
        </>
      )}
    </li>
  );
}

function SessionCell({
  date,
  session,
  isToday,
  onOpen,
  onRemove,
  onSaveItems,
}: {
  date: string;
  session: PlanSession | undefined;
  isToday: boolean;
  onOpen: () => void;
  onRemove: (id: number) => void;
  onSaveItems: (session: PlanSession, exercises: SessionExercise[]) => void;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const sensors = useDragSensors();
  const border = isToday ? "border-primary/60" : "";

  if (!session) {
    return (
      <button
        onClick={onOpen}
        className={`flex min-h-11 flex-1 flex-col items-center justify-start rounded-panel border border-dashed pt-3 text-text-secondary hover:border-primary hover:text-primary ${
          border || "border-border"
        }`}
      >
        <span className="text-body">+ añadir</span>
      </button>
    );
  }

  const logged = session.status === "logged";
  const badge = logged ? (
    <Badge tone="done" className="self-start">
      Hecho
    </Badge>
  ) : (
    <Badge tone="pending" className="self-start">
      Pendiente
    </Badge>
  );
  const order = session.exercises;
  const nameOf = (id: number | string) =>
    order.find((e) => e.exerciseId === id)?.exerciseName ?? "";

  /** Reordena en el sitio: el PUT (optimista en el hook) lo persiste al soltar. */
  const moveExercise = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = order.findIndex((e) => e.exerciseId === active.id);
    const to = order.findIndex((e) => e.exerciseId === over.id);
    if (from === -1 || to === -1) return;
    onSaveItems(session, arrayMove(order, from, to));
  };

  return (
    <div
      className={`flex min-h-11 flex-1 cursor-pointer flex-col gap-1 rounded-panel border border-border bg-surface p-2 ${border}`}
      onClick={() => (logged ? navigate(`/sesion/${date}`) : onOpen())}
    >
      <div className="flex items-center gap-2">
        <button
          className="min-w-0 flex-1 truncate text-left text-body font-semibold"
          aria-label={
            logged ? `Ver sesión del ${date}` : `Editar sesión del ${date}`
          }
          onClick={(e) => {
            e.stopPropagation();
            if (logged) navigate(`/sesion/${date}`);
            else onOpen();
          }}
        >
          {session.name ?? "Sesión"}
        </button>
        {logged ? null : (
          <>
            <button
              aria-label={`Añadir ejercicios al ${date}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="min-h-11 px-2 text-text-secondary hover:text-primary"
            >
              +
            </button>
            <button
              aria-label={`Desprogramar sesión del ${date}`}
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
              className="min-h-11 px-2 text-text-secondary hover:text-error"
            >
              ✕
            </button>
          </>
        )}
      </div>
      {badge}
      {order.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={moveExercise}
          accessibility={{
            screenReaderInstructions: DRAG_INSTRUCTIONS,
            announcements: sortableAnnouncements(
              nameOf,
              (id) => order.findIndex((e) => e.exerciseId === id) + 1,
            ),
          }}
        >
          <SortableContext
            items={order.map((e) => e.exerciseId)}
            strategy={verticalListSortingStrategy}
          >
            <ol
              aria-label={`Ejercicios del ${date}`}
              className="flex flex-1 flex-col gap-1"
            >
              {order.map((e) => (
                <CellRow
                  key={e.exerciseId}
                  exercise={e}
                  sortable={!logged}
                  removable={!logged}
                  onRemove={() => {
                    // Quitar el último deja el día sin items, y sin items no hay
                    // sesión (la API exige ≥1): eso es desprogramar el día, que
                    // es justo lo que hace la ✕ de la sesión.
                    if (order.length === 1) return onRemove(session.id);
                    onSaveItems(
                      session,
                      order.filter((x) => x.exerciseId !== e.exerciseId),
                    );
                  }}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : null}
      {confirming ? (
        <>
          <Button
            variant="danger"
            className="min-h-11 text-caption"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
              onRemove(session.id);
            }}
          >
            Confirmar desprogramar
          </Button>
          <Button
            variant="secondary"
            className="min-h-11 text-caption"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
            }}
          >
            Cancelar
          </Button>
        </>
      ) : null}
    </div>
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

  const byDate = new Map(week.sessions.map((s) => [s.date, s]));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <WeekGrid
        isoWeek={isoWeek}
        loading={week.loading && week.sessions.length === 0}
        error={week.error}
        onShiftWeek={(d) => gotoWeek(shiftIsoWeek(isoWeek, d))}
      >
        {({ date, isToday }) => (
          <SessionCell
            date={date}
            session={byDate.get(date)}
            isToday={isToday}
            onOpen={() => void openDay(date)}
            onRemove={(id) => void week.remove(id)}
            onSaveItems={(session, exercises) =>
              void week.saveItems(session, exercises)
            }
          />
        )}
      </WeekGrid>

      {dayLoading && <Card>Cargando sesión…</Card>}

      {day && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto scrim p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDay(null);
          }}
        >
          <div className="w-full max-w-4xl">
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

      {dayError && !day && <Card className="text-error">{dayError}</Card>}
    </div>
  );
}
