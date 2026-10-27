// /plan-fuerza — rejilla semanal + editor del día (sesión) en un único modal:
// lateral con lo ya añadido al día y selector de plantillas/ejercicios. La
// cabecera de la rejilla lleva el progreso ondulado de la semana y la racha;
// desprogramar (ejercicio o sesión) avisa con un snackbar que deshace. Cada día
// es una sesión con nombre, compuesta de ejercicios copiados desde plantillas
// (que se expanden y desaparecen) y/o sueltos, sin duplicados. El CRUD de
// plantillas vive en /plantillas.
//
// Copiar el plan: cada columna de día es el destino de «copiar desde otro día»
// y la cabecera copia una semana anterior entera sobre la que se ve
// (components/copy-session.tsx; las reglas puras, en lib/copy-session.ts). Se
// copia el plan, nunca el registro, y un destino registrado o con borrador no
// se escribe.
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
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useSearchParams } from "react-router";
import { CopyDayDialog, CopyWeekDialog } from "../components/copy-session";
import {
  EmptyState,
  Loader,
  Monogram,
  Shape,
  WavyProgress,
} from "../components/expressive";
import { GroupedExercises } from "../components/grouped-exercises";
import {
  AddIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  DeleteIcon,
  DumbbellIcon,
  FireIcon,
  GripIcon,
  PlayIcon,
  SearchIcon,
} from "../components/icons";
import { Dialog, useSnackbar } from "../components/overlay";
import {
  DRAG_INSTRUCTIONS,
  sortableAnnouncements,
  useDragSensors,
} from "../components/sortable";
import {
  Alert,
  Badge,
  Button,
  Chain,
  Chip,
  cx,
  Field,
  Input,
  ripple,
  SplitButton,
} from "../components/ui";
import { WeekGrid } from "../components/week-grid";
import { ApiError, apiGet, apiSend } from "../lib/api";
import {
  applyCopyOps,
  dayBlockedMessage,
  dayCopyMessage,
  dayCopyOp,
  daySources,
  sourceWeeks,
  type UndoStep,
  undoCopy,
  weekCopyDays,
  weekCopyMessage,
  weekCopyOps,
  weekCopySummary,
} from "../lib/copy-session";
import { dayLabel } from "../lib/day";
import { hasRealDraft } from "../lib/day-draft";
import {
  type Exercise,
  type ExerciseKind,
  type ExerciseMetric,
  KIND_LABELS,
  matchesExercise,
  targetSummary,
  useExercises,
} from "../lib/exercises";
import { currentIsoWeek, isoWeekDates, shiftIsoWeek } from "../lib/iso-week";
import {
  type PlanSession,
  type SessionExercise,
  type SessionItem,
  type SessionPayload,
  usePlanWeek,
} from "../lib/plan-week";
import { DEFAULT_REST_SECS, intAt, numAt, restAt } from "../lib/template-draft";
import { type Template, useTemplates } from "../lib/templates";
import { runViewTransition } from "../lib/view-transition";
import {
  blockLabel,
  blocks,
  DEFAULT_SETS,
  normalizeSupersets,
  setFields,
  weekProgress,
} from "../lib/workout";

// --- Editor del día (sesión) ------------------------------------------------

type DayRow = SessionItem & {
  key: string;
  exerciseId: number;
  exerciseName: string;
  kind: ExerciseKind;
  /** Unidad de la serie (solo fuerza): decide los campos de objetivo. */
  metric: ExerciseMetric;
};

function rowsFrom(session: PlanSession | null): DayRow[] {
  if (!session) return [];
  return session.exercises.map((e) => ({
    key: `e${e.id}`,
    exerciseId: e.exerciseId,
    exerciseName: e.exerciseName,
    kind: e.kind,
    metric: e.metric,
    targetSets: e.targetSets,
    targetRepsMin: e.targetRepsMin,
    targetRepsMax: e.targetRepsMax,
    targetDistanceKm: e.targetDistanceKm,
    targetDurationMin: e.targetDurationMin,
    // Un miembro encadenado no lleva descanso propio: los tiempos del bloque
    // los pone el último. El resto nace con 120 s (lo que ve el borrador es lo
    // que se guarda): vaciar el campo es lo que deja el ejercicio sin descanso.
    restSecs: e.superset
      ? null
      : (e.restSecs ?? (e.kind === "strength" ? DEFAULT_REST_SECS : null)),
    restAfterSecs: e.superset ? null : (e.restAfterSecs ?? DEFAULT_REST_SECS),
    superset: e.superset,
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
      metric: e.metric,
      targetSets: e.kind === "strength" ? (e.targetSets ?? DEFAULT_SETS) : null,
      targetRepsMin: e.targetRepsMin,
      targetRepsMax: e.targetRepsMax,
      targetDistanceKm: e.targetDistanceKm,
      targetDurationMin: e.targetDurationMin,
      restSecs: e.restSecs,
      restAfterSecs: e.restAfterSecs,
      superset: e.superset,
    });
  }
  return { rows: normalizeSupersets(rows), skipped };
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
    ? exercises.filter((e) => matchesExercise(e, query))
    : exercises;
  const pickClass =
    "state flex min-h-12 w-full items-center gap-3 rounded-l px-3 py-2 text-left text-body-l transition-colors motion-effects disabled:text-on-surface-variant";

  return (
    <section
      aria-label="Añadir al día"
      className="flex min-h-0 flex-col gap-3 rounded-l bg-surface-container-low p-3"
    >
      <h3 className="section-label">Añadir al día</h3>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-on-surface-variant" />
        <Input
          type="text"
          autoFocus
          placeholder="Buscar plantilla o ejercicio…"
          aria-label="Buscar plantilla o ejercicio"
          className="rounded-full bg-surface-container-high pl-11"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {note && (
        <p role="status" className="text-body-m text-on-surface-variant">
          {note}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <section className="flex flex-col gap-1">
          <h4 className="section-label">Plantillas</h4>
          {templatesError ? (
            <Alert>
              <p>{templatesError}</p>
              <Button variant="outlined" size="sm" onClick={onRetryTemplates}>
                Reintentar
              </Button>
            </Alert>
          ) : shownTemplates.length === 0 ? (
            <p className="px-3 text-body-m text-on-surface-variant">
              Sin plantillas
            </p>
          ) : (
            <ul className="stagger flex flex-col gap-1">
              {shownTemplates.map((t, i) => {
                const done =
                  t.exercises.length > 0 &&
                  t.exercises.every((e) => takenIds.has(e.exerciseId));
                return (
                  <li key={t.id} style={{ ["--i" as string]: i }}>
                    <button
                      type="button"
                      className={pickClass}
                      disabled={done}
                      onPointerDown={ripple}
                      onClick={() => {
                        if (!done) onPickTemplate(t);
                      }}
                    >
                      <Monogram name={t.name} size={36} />
                      <span className="min-w-0 flex-1">
                        {t.name}
                        <span className="ml-2 text-body-m text-on-surface-variant">
                          {done
                            ? "ya añadida"
                            : `${t.exercises.length} ${
                                t.exercises.length === 1
                                  ? "ejercicio"
                                  : "ejercicios"
                              }`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-1">
          <h4 className="section-label">Ejercicios</h4>
          {shownExercises.length === 0 ? (
            <p className="px-3 text-body-m text-on-surface-variant">
              Sin ejercicios
            </p>
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
                      type="button"
                      className={pickClass}
                      disabled={taken}
                      onPointerDown={ripple}
                      onClick={() => {
                        if (!taken) onPickExercise(e);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        {e.name}
                        {e.kind === "strength"
                          ? null
                          : ` · ${KIND_LABELS[e.kind]}`}
                        {taken ? (
                          <span className="ml-2 text-body-m">ya añadido</span>
                        ) : null}
                      </span>
                      {taken ? (
                        <CheckIcon className="text-accent" />
                      ) : (
                        <AddIcon className="text-on-surface-variant" />
                      )}
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

/** Paso numérico compacto de la fila del día (etiqueta encima, 48 px). */
function Target({
  label,
  aria,
  wide,
  ...rest
}: {
  label: string;
  aria: string;
  wide?: boolean;
} & Pick<
  ComponentProps<"input">,
  "value" | "onChange" | "min" | "step" | "placeholder"
>) {
  return (
    <label className="flex flex-col gap-1 text-label-m text-on-surface-variant">
      {label}
      <Input
        className={cx("tabular px-3 text-on-surface", wide ? "w-24" : "w-20")}
        type="number"
        aria-label={aria}
        {...rest}
      />
    </label>
  );
}

/** Fila arrastrable del día: el asa cambia el orden (ratón, táctil o teclado). */
function DayRowItem({
  row,
  index,
  canChain,
  closesBlock,
  nextName,
  onPatch,
  onToggleChain,
  onRemove,
}: {
  row: DayRow;
  index: number;
  /** Puede encadenarse: fuerza con otro ejercicio de fuerza justo detrás. */
  canChain: boolean;
  /** Cierra un bloque: sus descansos son los del bloque. */
  closesBlock: boolean;
  nextName: string;
  onPatch: (key: string, patch: Partial<DayRow>) => void;
  onToggleChain: (key: string) => void;
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
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ["--i" as string]: index,
      }}
      className={cx(
        "flex flex-wrap items-end gap-2 rounded-l bg-surface-container-highest p-3",
        isDragging && "relative z-10 opacity-70 shadow-2",
      )}
    >
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          className="state grid size-12 shrink-0 cursor-grab touch-none place-items-center rounded-full text-on-surface-variant active:cursor-grabbing"
          aria-label={`Mover ${row.exerciseName}`}
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
        <span className="min-w-0 flex-1 text-title-m">{row.exerciseName}</span>
        {row.kind === "strength" ? null : (
          <Badge tone="pending">{KIND_LABELS[row.kind]}</Badge>
        )}
        <Chip
          pressed={Boolean(row.superset)}
          disabled={!canChain}
          aria-label={`Encadenar ${row.exerciseName} con el siguiente`}
          title={
            canChain
              ? "Encadenar con el siguiente (superserie)"
              : "No se puede encadenar este ejercicio"
          }
          onClick={() => onToggleChain(row.key)}
        >
          Encadenar
        </Chip>
        <Button
          variant="text"
          size="icon"
          className="text-on-surface-variant"
          aria-label={`Quitar ${row.exerciseName}`}
          title="Quitar"
          onClick={() => onRemove(row.key)}
        >
          <DeleteIcon />
        </Button>
      </div>
      {row.kind === "strength" ? (
        <>
          <Target
            label="Series"
            aria={`${row.exerciseName} series`}
            min={1}
            value={row.targetSets ?? ""}
            onChange={(e) =>
              onPatch(row.key, { targetSets: intAt(e.target.value) })
            }
          />
          {/* Los ejercicios por tiempo no se prescriben en repeticiones. */}
          {setFields(row.metric).reps && (
            <>
              <Target
                label="Reps mín"
                aria={`${row.exerciseName} reps mín`}
                min={1}
                value={row.targetRepsMin ?? ""}
                onChange={(e) =>
                  onPatch(row.key, { targetRepsMin: intAt(e.target.value) })
                }
              />
              <Target
                label="Reps máx"
                aria={`${row.exerciseName} reps máx`}
                min={1}
                value={row.targetRepsMax ?? ""}
                onChange={(e) =>
                  onPatch(row.key, { targetRepsMax: intAt(e.target.value) })
                }
              />
            </>
          )}
          {row.superset ? (
            <p className="min-h-12 text-body-m text-on-surface-variant">
              Sin descanso: va pegado a «{nextName}»
            </p>
          ) : (
            <>
              <Target
                label={
                  closesBlock
                    ? "Descanso entre vueltas (s)"
                    : "Descanso entre series (s)"
                }
                aria={`${row.exerciseName} descanso entre series`}
                min={1}
                placeholder="120"
                value={row.restSecs ?? ""}
                onChange={(e) =>
                  onPatch(row.key, { restSecs: restAt(e.target.value) })
                }
              />
              <Target
                label={
                  closesBlock
                    ? "Descanso al acabar el bloque (s)"
                    : "Descanso al terminar (s)"
                }
                aria={`${row.exerciseName} descanso al terminar`}
                min={1}
                placeholder="120"
                value={row.restAfterSecs ?? ""}
                onChange={(e) =>
                  onPatch(row.key, { restAfterSecs: restAt(e.target.value) })
                }
              />
            </>
          )}
        </>
      ) : (
        <>
          <Target
            label="Distancia (km)"
            aria={`${row.exerciseName} distancia (km)`}
            wide
            min={0}
            step="0.1"
            value={row.targetDistanceKm ?? ""}
            onChange={(e) =>
              onPatch(row.key, { targetDistanceKm: numAt(e.target.value) })
            }
          />
          <Target
            label="Tiempo (min)"
            aria={`${row.exerciseName} tiempo (min)`}
            wide
            min={0}
            value={row.targetDurationMin ?? ""}
            onChange={(e) =>
              onPatch(row.key, { targetDurationMin: intAt(e.target.value) })
            }
          />
          <Target
            label="Descanso al terminar (s)"
            aria={`${row.exerciseName} descanso al terminar`}
            min={1}
            placeholder="120"
            value={row.restAfterSecs ?? ""}
            onChange={(e) =>
              onPatch(row.key, { restAfterSecs: restAt(e.target.value) })
            }
          />
        </>
      )}
    </li>
  );
}

/** Contenido del modal del día: lateral con lo añadido + selector para sumar
 *  más. Guardar es un botón dividido: «Guardar» o «Guardar y registrar». */
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
  onSave: (payload: SessionPayload, andLog: boolean) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(session?.name ?? "");
  const [rows, setRows] = useState<DayRow[]>(() => rowsFrom(session));
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const takenIds = new Set(rows.map((r) => r.exerciseId));
  const sensors = useDragSensors();

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
      return from === -1 || to === -1
        ? rs
        : normalizeSupersets(arrayMove(rs, from, to));
    });
  };

  const patchRow = (key: string, patch: Partial<DayRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Encadena o suelta una fila. Encadenada va sin descanso propio; al soltarla
   *  recupera los 120 s por defecto (lo que ve el borrador es lo que se guarda). */
  const toggleChain = (key: string) =>
    setRows((rs) =>
      normalizeSupersets(
        rs.map((r) => {
          if (r.key !== key) return r;
          if (r.superset)
            return {
              ...r,
              superset: false,
              restSecs: r.kind === "strength" ? DEFAULT_REST_SECS : null,
              restAfterSecs: DEFAULT_REST_SECS,
            };
          return { ...r, superset: true, restSecs: null, restAfterSecs: null };
        }),
      ),
    );

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
        metric: e.metric,
        targetSets: e.kind === "strength" ? DEFAULT_SETS : null,
        targetRepsMin: null,
        targetRepsMax: null,
        targetDistanceKm: null,
        targetDurationMin: null,
        restSecs: e.kind === "strength" ? DEFAULT_REST_SECS : null,
        restAfterSecs: DEFAULT_REST_SECS,
        superset: false,
      },
    ]);
  };

  const save = (andLog: boolean) => {
    if (saving || rows.length === 0) return;
    onSave(
      {
        name: name.trim() === "" ? null : name.trim(),
        items: rows.map((r) => ({
          exerciseId: r.exerciseId,
          targetSets: r.targetSets,
          targetRepsMin: r.targetRepsMin,
          targetRepsMax: r.targetRepsMax,
          targetDistanceKm: r.targetDistanceKm,
          targetDurationMin: r.targetDurationMin,
          restSecs: r.restSecs,
          restAfterSecs: r.restAfterSecs,
          superset: r.superset ?? false,
        })),
      },
      andLog,
    );
  };

  return (
    <>
      <header className="flex flex-wrap items-center gap-4 px-4 pt-4 md:px-6 md:pt-5">
        <Shape name="cookie-12" size={48} className="text-accent-container">
          <DumbbellIcon className="text-on-accent-container" />
        </Shape>
        <h2
          id="day-editor-title"
          className="min-w-0 flex-1 text-headline-s text-e"
        >
          {session ? "Editar sesión" : "Nueva sesión"}{" "}
          <span className="tabular text-on-surface-variant">· {date}</span>
        </h2>
        <Button
          variant="text"
          size="icon"
          aria-label="Cerrar"
          className="text-on-surface-variant"
          onClick={onCancel}
        >
          <CloseIcon />
        </Button>
        <Field label="Nombre" className="w-full">
          {(a) => (
            <Input
              {...a}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
      </header>

      {serverError && <Alert className="mx-4 md:mx-6">{serverError}</Alert>}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 overflow-hidden px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-rows-1 md:px-6">
        <section className="flex min-h-0 flex-col gap-2">
          <h3 className="section-label">
            Ejercicios del día <span className="tabular">({rows.length})</span>
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
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
              >
                {/* Cada bloque va en su contenedor —la caja cuando encadena
                    más de un miembro—: la estructura no cambia al encadenar. */}
                {blocks(rows).map((block) => {
                  const row = (i: number) => (
                    <DayRowItem
                      key={rows[i].key}
                      row={rows[i]}
                      index={i}
                      canChain={
                        rows[i].kind === "strength" &&
                        rows[i + 1] !== undefined &&
                        rows[i + 1].kind === "strength"
                      }
                      closesBlock={Boolean(rows[i - 1]?.superset)}
                      nextName={rows[i + 1]?.exerciseName ?? ""}
                      onPatch={patchRow}
                      onToggleChain={toggleChain}
                      onRemove={(key) =>
                        setRows((rs) =>
                          normalizeSupersets(rs.filter((r) => r.key !== key)),
                        )
                      }
                    />
                  );
                  return (
                    <Chain
                      key={`c${rows[block[0]].key}`}
                      label={
                        block.length > 1 ? blockLabel(block.length) : undefined
                      }
                    >
                      {block.map(row)}
                    </Chain>
                  );
                })}
                {rows.length === 0 && (
                  <li className="rounded-l bg-surface-container-low">
                    <EmptyState
                      title="Sin ejercicios todavía"
                      shapes={["sunny", "pill", "cookie-4"]}
                    >
                      <p className="text-body-m text-on-surface-variant">
                        Añade una plantilla o ejercicios sueltos.
                      </p>
                    </EmptyState>
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

      <footer className="flex flex-wrap items-center gap-2 px-4 pt-2 pb-4 md:px-6 md:pb-5">
        {session &&
          (confirming ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-body-m">¿Eliminar la sesión completa?</span>
              <Button variant="danger" onClick={onDelete}>
                Confirmar
              </Button>
              <Button variant="outlined" onClick={() => setConfirming(false)}>
                No
              </Button>
            </span>
          ) : (
            <Button variant="text" onClick={() => setConfirming(true)}>
              <DeleteIcon />
              Eliminar sesión
            </Button>
          ))}
        <span className="ml-auto flex items-center gap-2">
          <Button variant="outlined" onClick={onCancel}>
            Cancelar
          </Button>
          <SplitButton
            onClick={() => save(false)}
            menuLabel="Más formas de guardar"
            menuPlacement="top"
            disabled={saving || rows.length === 0}
            items={[
              {
                label: "Guardar y registrar",
                icon: <PlayIcon className="text-accent" />,
                onSelect: () => save(true),
              },
            ]}
          >
            {saving ? "Guardando…" : "Guardar"}
          </SplitButton>
        </span>
      </footer>
    </>
  );
}

// --- Celdas de la rejilla ----------------------------------------------------

/** Fila de la celda: asa (días planned) + nombre + info del objetivo. La ✕
 *  desprograma el ejercicio: la fila se convierte en su propio «¿Quitar?» con
 *  Sí/No, sin abrir el editor del día. */
function CellRow({
  exercise,
  index,
  sortable,
  removable,
  onRemove,
}: {
  exercise: SessionExercise;
  index: number;
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
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ["--i" as string]: index,
      }}
      className={cx(
        "flex min-h-11 flex-1 items-center gap-1 rounded-m px-2 py-1.5 transition-colors motion-effects",
        confirming
          ? "bg-error-container text-on-error-container"
          : "bg-surface-container-high",
        isDragging && "relative z-10 opacity-70 shadow-2",
      )}
    >
      {confirming ? (
        <>
          {/* Una sola línea: la columna mide ~152px y dos botones anchos se
              salían de la fila (tapaban el día siguiente). El nombre trunca. */}
          <span
            className="min-w-0 flex-1 truncate text-label-m"
            title={exercise.exerciseName}
          >
            {exercise.exerciseName}
          </span>
          <Button
            variant="danger"
            size="icon-sm"
            className="h-11 shrink-0 text-label-l"
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
            variant="outlined"
            size="icon-sm"
            className="h-11 shrink-0 text-label-l"
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
              className="-ml-1 grid h-11 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-s text-on-surface-variant transition-colors motion-effects hover:text-accent active:cursor-grabbing"
              aria-label={`Mover ${exercise.exerciseName}`}
              onClick={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <GripIcon width={20} height={20} />
            </button>
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="line-clamp-2 hyphens-auto text-body-m text-on-surface">
              {exercise.exerciseName}
            </span>
            {info ? (
              <span className="text-label-s tabular text-on-surface-variant">
                {info}
              </span>
            ) : null}
          </span>
          {removable ? (
            <button
              type="button"
              className="state -mr-1 grid h-11 w-6 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors motion-effects hover:text-error"
              aria-label={`Desprogramar ${exercise.exerciseName}`}
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
            >
              <CloseIcon width={18} height={18} />
            </button>
          ) : null}
        </>
      )}
    </li>
  );
}

/** Nombre de la transición de contenedor día → modal (View Transitions). */
const DAY_SHEET = "day-sheet";

function SessionCell({
  date,
  session,
  isToday,
  morphing,
  copyBlocked,
  onOpen,
  onCopy,
  onRemove,
  onRemoveExercise,
  onSaveItems,
}: {
  date: string;
  session: PlanSession | undefined;
  isToday: boolean;
  /** Esta celda es el origen de la transición hacia el modal. */
  morphing: boolean;
  /** Motivo por el que no se puede copiar a este día (null = se puede). */
  copyBlocked: string | null;
  onOpen: () => void;
  onCopy: () => void;
  onRemove: (session: PlanSession) => void;
  onRemoveExercise: (session: PlanSession, exercise: SessionExercise) => void;
  onSaveItems: (session: PlanSession, exercises: SessionExercise[]) => void;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const sensors = useDragSensors();
  const morph = morphing ? { viewTransitionName: DAY_SHEET } : undefined;

  /** Copiar a este día: vive en la celda (no en la cabecera de la columna, que
   *  a 1280 no da ancho para el nombre del día) y no añade alto: en un día con
   *  sesión va en la fila de la insignia y en uno vacío, junto a «añadir». Mide
   *  40 px de área táctil (la cuarta excepción a los 48, en AGENTS.md); en la
   *  fila de 24 px de la insignia las marcas negativas evitan estirarla. */
  const copyControl = (compact: boolean) => (
    <button
      type="button"
      aria-label={`Copiar al ${dayLabel(date)}`}
      title={copyBlocked ?? "Copiar aquí desde otro día"}
      className={cx(
        "state grid size-10 shrink-0 place-items-center rounded-full text-on-surface-variant",
        compact ? "-my-2" : "self-center",
        copyBlocked ? "opacity-60" : "hover:text-accent",
      )}
      onPointerDown={ripple}
      onClick={(e) => {
        e.stopPropagation();
        onCopy();
      }}
    >
      <CopyIcon width={18} height={18} />
    </button>
  );

  if (!session) {
    return (
      <div className="flex flex-1 gap-1">
        <Button
          variant="text"
          aria-label="+ añadir"
          style={morph}
          onClick={onOpen}
          className={cx(
            "min-h-12 flex-1 flex-col justify-start gap-1 rounded-m border border-dashed pt-3 text-on-surface-variant hover:text-accent",
            isToday ? "border-accent" : "border-outline-variant",
          )}
        >
          <AddIcon />
          añadir
        </Button>
        {copyControl(false)}
      </div>
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
    onSaveItems(session, normalizeSupersets(arrayMove(order, from, to)));
  };

  return (
    <div
      style={morph}
      className={cx(
        "flex min-h-11 flex-1 cursor-pointer flex-col gap-1 rounded-l p-1 transition-colors motion-effects",
        logged
          ? "bg-primary-container text-on-primary-container"
          : "bg-surface-container",
        isToday && !logged && "ring-2 ring-accent",
      )}
      onClick={() => (logged ? navigate(`/sesion/${date}`) : onOpen())}
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="state min-h-11 min-w-0 flex-1 truncate rounded-m px-1 text-left text-title-s text-e"
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
        {logged ? (
          <Shape name="sunny" size={28} className="text-primary">
            <CheckIcon width={16} height={16} className="text-on-primary" />
          </Shape>
        ) : (
          <>
            <button
              type="button"
              aria-label={`Añadir ejercicios al ${date}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="state grid h-11 w-7 shrink-0 place-items-center rounded-full text-on-surface-variant hover:text-accent"
            >
              <AddIcon width={20} height={20} />
            </button>
            <button
              type="button"
              aria-label={`Desprogramar sesión del ${date}`}
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
              className="state grid h-11 w-7 shrink-0 place-items-center rounded-full text-on-surface-variant hover:text-error"
            >
              <CloseIcon width={20} height={20} />
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        {badge}
        <span className="ml-auto">{copyControl(true)}</span>
      </div>
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
              {/* Cada bloque es un hueco con el alto de sus miembros
                  (`flexGrow`): la caja no cambia el reparto de la columna. */}
              {blocks(order).map((block) => {
                const row = (i: number) => (
                  <CellRow
                    key={order[i].exerciseId}
                    exercise={order[i]}
                    index={i}
                    sortable={!logged}
                    removable={!logged}
                    onRemove={() => onRemoveExercise(session, order[i])}
                  />
                );
                return (
                  <Chain
                    key={`c${order[block[0]].exerciseId}`}
                    label={
                      block.length > 1 ? blockLabel(block.length) : undefined
                    }
                    style={{ flexGrow: block.length, flexBasis: 0 }}
                  >
                    {block.map(row)}
                  </Chain>
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      ) : null}
      {confirming ? (
        // Misma confirmación en línea que la fila: «Confirmar desprogramar» a
        // lo ancho no cabe en los ~152 px de la columna.
        <div className="flex min-h-11 items-center gap-1 rounded-m bg-error-container py-1 pr-1 pl-2 text-on-error-container">
          <span className="min-w-0 flex-1 truncate text-label-m">
            ¿Desprogramar?
          </span>
          <Button
            variant="danger"
            size="icon-sm"
            className="h-11 shrink-0 text-label-l"
            aria-label="Confirmar desprogramar"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
              onRemove(session);
            }}
          >
            Sí
          </Button>
          <Button
            variant="outlined"
            size="icon-sm"
            className="h-11 shrink-0 text-label-l"
            aria-label="Cancelar"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
            }}
          >
            No
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Cabecera de la rejilla: progreso ondulado de la semana y racha. */
function WeekAside({
  logged,
  total,
  streak,
}: {
  logged: number;
  total: number;
  streak: number;
}) {
  return (
    <>
      <div className="flex min-w-40 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2 text-label-m text-on-surface-variant">
          Sesiones registradas esta semana
          <span className="text-title-m text-e tabular text-accent">
            {logged}/{total}
          </span>
        </span>
        <WavyProgress
          value={logged}
          max={total}
          label="Sesiones registradas esta semana"
        />
      </div>
      <span
        className="flex items-center gap-2 rounded-full bg-surface-container-high py-1 pr-3 pl-1"
        title="Semanas seguidas con al menos una sesión registrada"
      >
        <Shape
          name="sunny"
          size={32}
          className={
            streak > 0 ? "text-tertiary" : "text-surface-container-highest"
          }
        >
          <FireIcon
            filled
            width={18}
            height={18}
            className={
              streak > 0 ? "text-on-tertiary" : "text-on-surface-variant"
            }
          />
        </Shape>
        <span className="text-label-l">
          <span className="text-title-m text-e tabular">{streak}</span>{" "}
          {streak === 1 ? "semana seguida" : "semanas seguidas"}
        </span>
      </span>
    </>
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
  /** Día cuya celda se transforma en el modal (viewTransitionName). */
  const [morphDate, setMorphDate] = useState<string | null>(null);
  /** Día destino de «copiar sesión» (null = diálogo cerrado). */
  const [copyDay, setCopyDay] = useState<string | null>(null);
  const [copyWeek, setCopyWeek] = useState(false);
  const [daySaving, setDaySaving] = useState(false);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const { exercises } = useExercises();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const isoWeek = params.get("week") ?? currentIsoWeek();
  const gotoWeek = (week: string) => setParams({ week });
  const week = usePlanWeek(isoWeek);
  const progress = weekProgress(week.sessions);

  /** Abre el modal desde la celda: la celda y el diálogo comparten nombre de
   *  transición, así que el navegador anima el contenedor día → modal. */
  const showDay = (next: { date: string; session: PlanSession | null }) => {
    // La celda lleva el nombre en la foto «antes» (flushSync: pintado ya).
    flushSync(() => setMorphDate(next.date));
    void runViewTransition(() => flushSync(() => setDay(next))).then(() =>
      setMorphDate(null),
    );
  };

  /** Abre (o crea) el editor del día; el detalle se carga por HTTP. */
  const openDay = async (date: string) => {
    setDayError(null);
    const found = week.sessions.find((s) => s.date === date);
    if (!found || found.status === "logged") {
      showDay({ date, session: null });
      return;
    }
    setDayLoading(true);
    try {
      const detail = await apiGet<PlanSession>(
        `/api/plan-sessions/${found.id}`,
      );
      showDay({ date, session: detail });
    } catch (e) {
      setDay(null);
      setDayError(
        e instanceof Error ? e.message : "No se pudo cargar la sesión",
      );
    } finally {
      setDayLoading(false);
    }
  };

  const closeDay = () => {
    setDay(null);
    setMorphDate(null);
  };

  const saveDay = async (payload: SessionPayload, andLog: boolean) => {
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
      if (andLog) {
        navigate(`/sesion/${day.date}`);
        return;
      }
      await week.reload();
      closeDay();
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
      closeDay();
    } catch (e) {
      setDayError(
        e instanceof ApiError ? e.error : "No se pudo eliminar la sesión",
      );
    } finally {
      setDaySaving(false);
    }
  };

  /** Desprograma el día entero; «Deshacer» lo recrea con sus objetivos. */
  const unschedule = async (session: PlanSession) => {
    // Solo las planificadas: recrear una registrada con POST perdería su
    // registro de series (la celda de una registrada ya no ofrece la ✕).
    if (session.status === "logged") return;
    if (!(await week.remove(session.id))) return;
    snackbar({
      message: `Sesión del ${session.date} desprogramada`,
      onUndo: () => void week.recreate(session),
    });
  };

  /** Quita un ejercicio de la celda; «Deshacer» vuelve a guardar los de antes.
   *  Quitar el último deja el día sin items, y sin items no hay sesión (la API
   *  exige ≥1): eso es desprogramar el día, igual que la ✕ de la sesión. */
  const unscheduleExercise = async (
    session: PlanSession,
    exercise: SessionExercise,
  ) => {
    if (session.exercises.length === 1) return unschedule(session);
    const before = session.exercises;
    const ok = await week.saveItems(
      session,
      normalizeSupersets(
        before.filter((x) => x.exerciseId !== exercise.exerciseId),
      ),
    );
    if (!ok) return;
    snackbar({
      message: `${exercise.exerciseName} desprogramado`,
      onUndo: () => void week.saveItems(session, before),
    });
  };

  const byDate = new Map(week.sessions.map((s) => [s.date, s]));

  /** Borradores con trabajo sin registrar: copiar encima los tiraría. Se leen
   *  una vez por semana (localStorage + JSON en el render de cada columna, en
   *  cada render, era tirar el trabajo hecho). Los dos diálogos solo escriben
   *  en días de la semana que se ve, que es la que se lee aquí. */
  const draftsWithWork = useMemo(() => {
    const flags = new Map<string, boolean>();
    for (const date of isoWeekDates(isoWeek))
      flags.set(date, hasRealDraft(date));
    return flags;
  }, [isoWeek]);
  const hasDraft = (date: string) => draftsWithWork.get(date) ?? false;

  /** El «Deshacer» de la copia: vuelve a escribir lo de antes y recarga. Si el
   *  servidor no deja deshacer algún paso, se dice (la rejilla ya recarga). */
  const undoAndReload = async (steps: UndoStep[]) => {
    const failed = await undoCopy(steps);
    await week.reload();
    if (failed.length > 0)
      snackbar({
        message:
          "No se pudo deshacer todo: la rejilla se ha recargado con lo que hay en el servidor.",
      });
  };

  /** Copia el plan de `source` sobre el día `target` (crear o sustituir). Un
   *  fallo a medio camino deshace lo aplicado y recarga: la rejilla nunca
   *  enseña un 409 crudo ni queda a medias. */
  const copyDayTo = async (target: string, source: PlanSession) => {
    let steps: UndoStep[];
    try {
      steps = await applyCopyOps([
        dayCopyOp(target, source, byDate.get(target)),
      ]);
    } catch (e) {
      await week.reload();
      throw e;
    }
    await week.reload();
    snackbar({
      message: dayCopyMessage(target, source.exercises.length),
      onUndo: () => void undoAndReload(steps),
    });
  };

  /** Copia la semana `from` sobre la que se ve: se vacía y se copia día a día. */
  const copyWeekFrom = async (from: string) => {
    const days = weekCopyDays(
      isoWeekDates(isoWeek),
      isoWeekDates(from),
      week.all,
    );
    let steps: UndoStep[];
    try {
      steps = await applyCopyOps(weekCopyOps(days));
    } catch (e) {
      await week.reload();
      throw e;
    }
    await week.reload();
    snackbar({
      message: weekCopyMessage(weekCopySummary(days)),
      onUndo: () => void undoAndReload(steps),
    });
  };

  /** Copiar a un día que no se puede escribir no es una acción disponible: el
   *  control lo dice en su `title` y el diálogo, que sí se abre, explica por qué. */
  const copyBlocker = (date: string) =>
    dayBlockedMessage(byDate.get(date), hasDraft(date), date);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-4">
      <WeekGrid
        isoWeek={isoWeek}
        loading={week.loading && week.sessions.length === 0}
        busy={week.loading}
        error={week.error}
        onRetry={() => void week.reload()}
        onShiftWeek={(d) => gotoWeek(shiftIsoWeek(isoWeek, d))}
        weekAction={
          <Button
            variant="tonal"
            onClick={() => setCopyWeek(true)}
            title="Copiar otra semana sobre esta"
          >
            <CopyIcon />
            Copiar semana
          </Button>
        }
        aside={
          <WeekAside
            logged={progress.logged}
            total={progress.total}
            streak={week.streak}
          />
        }
      >
        {({ date, isToday }) => (
          <SessionCell
            date={date}
            session={byDate.get(date)}
            isToday={isToday}
            morphing={morphDate === date && day === null}
            copyBlocked={copyBlocker(date)}
            onOpen={() => void openDay(date)}
            onCopy={() => setCopyDay(date)}
            onRemove={(session) => void unschedule(session)}
            onRemoveExercise={(session, e) =>
              void unscheduleExercise(session, e)
            }
            onSaveItems={(session, exercises) =>
              void week.saveItems(session, exercises)
            }
          />
        )}
      </WeekGrid>

      {/* Encima de la rejilla, fuera del flujo: en la columna le robaba alto
          y la rejilla volvía a crecer mientras la modal se expandía. */}
      {dayLoading && (
        <Loader
          label="Cargando sesión…"
          className="pointer-events-none absolute inset-0"
        />
      )}

      {day && (
        <Dialog
          onClose={closeDay}
          labelledBy="day-editor-title"
          mobile="sheet"
          className="md:h-[88vh] md:max-w-4xl"
        >
          <div
            style={{ viewTransitionName: DAY_SHEET }}
            className="flex min-h-0 flex-1 flex-col"
          >
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
              onSave={(payload, andLog) => void saveDay(payload, andLog)}
              onDelete={() => void deleteDay()}
              onCancel={closeDay}
            />
          </div>
        </Dialog>
      )}

      {dayError && !day && <Alert>{dayError}</Alert>}

      {/* Copiar el plan de otro día: el que se ve es el destino. */}
      {copyDay && (
        <CopyDayDialog
          target={copyDay}
          targetSession={byDate.get(copyDay)}
          sources={daySources(week.all, copyDay)}
          hasDraft={hasDraft(copyDay)}
          onCopy={(source) => copyDayTo(copyDay, source)}
          onClose={() => setCopyDay(null)}
        />
      )}

      {/* Copiar una semana anterior sobre la que se ve. */}
      {copyWeek && (
        <CopyWeekDialog
          week={isoWeek}
          weeks={sourceWeeks(week.all, isoWeek)}
          sessions={week.all}
          hasDraft={hasDraft}
          onCopy={copyWeekFrom}
          onClose={() => setCopyWeek(false)}
        />
      )}
    </div>
  );
}
