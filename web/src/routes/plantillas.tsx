// /plantillas — CRUD de plantillas (agrupaciones semánticas de ejercicios y/o
// cardio, sin rotación). Vivían al pie de /plan-fuerza; ahora tienen su página
// y el planificador solo las usa para expandirlas en un día.
//
// Crear y editar viven en una modal con URL propia (`/plantillas/nueva` y
// `/plantillas/:id/editar`, rutas bajo la lista): el borrador se compone dentro
// de un único `role=dialog` —ejercicios a la izquierda, selector con mapa
// muscular a la derecha— y se persiste de una sola vez al guardar.
import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import { Link, Navigate, useMatch, useNavigate } from "react-router";
import { BodyMap, type BodyView } from "../components/body-map/body-map";
import { regionLabel } from "../components/body-map/regions";
import {
  GROUP_LABELS,
  GroupedExercises,
  MUSCLE_GROUPS,
} from "../components/grouped-exercises";
import {
  DRAG_INSTRUCTIONS,
  GripIcon,
  sortableAnnouncements,
  useDragSensors,
} from "../components/sortable";
import { Badge, Button, Card, cardClass, Input } from "../components/ui";
import { apiField } from "../lib/api";
import {
  type Exercise,
  KIND_LABELS,
  targetSummary,
  useExercises,
} from "../lib/exercises";
import {
  addEntry,
  buildTemplatePayload,
  type Draft,
  type DraftEntry,
  intAt,
  moveEntry,
  newEntryKey,
  nextCopyName,
  numAt,
  removeEntry,
  setTargets,
  type Targets,
} from "../lib/template-draft";
import { type Template, useTemplates } from "../lib/templates";

const toDraft = (t: Template): Draft => ({
  name: t.name,
  entries: t.exercises.map((e) => ({
    key: `s${e.id}`,
    exerciseId: e.exerciseId,
    exerciseName: e.exerciseName,
    kind: e.kind,
    targetSets: e.targetSets,
    targetRepsMin: e.targetRepsMin,
    targetRepsMax: e.targetRepsMax,
    targetDistanceKm: e.targetDistanceKm,
    targetDurationMin: e.targetDurationMin,
  })),
});

// --- Añadir ejercicio (columna de la modal) ----------------------------------

/** Selector de ejercicios embebido: vista de mapa corporal (que filtra por
 *  sub-región muscular), fichas de grupo padre, búsqueda y lista agrupada por
 *  músculo. Los dos niveles del filtro son excluyentes. Sin overlay ni
 *  `role=dialog` propios — la modal de plantilla es el único diálogo abierto. */
function ExercisePicker({
  exercises,
  draftEntries,
  onAdd,
}: {
  exercises: Exercise[];
  draftEntries: DraftEntry[];
  onAdd: (e: Exercise) => void;
}) {
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [view, setView] = useState<BodyView>("front");

  const q = search.trim().toLowerCase();
  const picks = exercises.filter((e) => {
    // Dos niveles excluyentes: la sub-región es lo fino y el grupo padre es lo
    // ancho. Como toda sub-región cuelga de un grupo que el ejercicio tiene
    // como tag, filtrar por el grupo devuelve también sus sub-regiones.
    if (region !== null && !e.regions.includes(region)) return false;
    if (group !== null && !e.tags.includes(group)) return false;
    if (
      q &&
      !(
        e.name.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)) ||
        e.regions.some((r) => regionLabel(r).toLowerCase().includes(q))
      )
    )
      return false;
    return true;
  });
  const inDraftIds = new Set(draftEntries.map((en) => en.exerciseId));
  const filter = region
    ? regionLabel(region)
    : group
      ? (GROUP_LABELS[group] ?? group)
      : null;

  return (
    <section
      aria-label="Añadir ejercicio"
      className="flex min-h-0 flex-col gap-2"
    >
      <h3 className="section-label">Añadir ejercicio</h3>

      {/* Desde `md`, el dibujo se lleva el alto libre de la columna y la lista el
          suyo (crece con la modal en vez de encogerse por la lista). En móvil se
          apila y el conjunto se desplaza, como antes. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:flex-row md:overflow-visible">
        <div className="flex shrink-0 justify-center">
          <BodyMap
            view={view}
            regions={region ? [region] : []}
            onSelect={(id) => {
              setRegion((r) => (r === id ? null : id));
              setGroup(null);
            }}
          />
        </div>

        <div className="flex flex-col gap-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2 text-caption">
            <span className="font-medium">Vista:</span>
            <Button
              size="sm"
              variant={view === "front" ? "primary" : "secondary"}
              aria-pressed={view === "front"}
              onClick={() => setView("front")}
            >
              Frontal
            </Button>
            <Button
              size="sm"
              variant={view === "back" ? "primary" : "secondary"}
              aria-pressed={view === "back"}
              onClick={() => setView("back")}
            >
              Trasera
            </Button>
          </div>

          <div
            role="group"
            aria-labelledby="pick-groups-label"
            className="flex flex-wrap items-center gap-1 text-caption"
          >
            <span id="pick-groups-label" className="font-medium">
              Grupo:
            </span>
            <Button
              size="sm"
              variant={filter === null ? "primary" : "secondary"}
              aria-pressed={filter === null}
              onClick={() => {
                setRegion(null);
                setGroup(null);
              }}
            >
              Todos
            </Button>
            {MUSCLE_GROUPS.map((g) => (
              <Button
                key={g}
                size="sm"
                variant={group === g ? "primary" : "secondary"}
                aria-pressed={group === g}
                onClick={() => {
                  setGroup((prev) => (prev === g ? null : g));
                  setRegion(null);
                }}
              >
                {GROUP_LABELS[g]}
              </Button>
            ))}
          </div>

          <p className="text-caption text-text-secondary">
            {region ? `Músculo: ${filter}` : `Grupo: ${filter ?? "Todos"}`}
          </p>

          <Input
            placeholder="Buscar ejercicio"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="min-h-0 md:flex-1 md:overflow-y-auto">
            {picks.length === 0 ? (
              <p className="text-caption text-text-secondary">Sin ejercicios</p>
            ) : (
              <GroupedExercises
                exercises={picks}
                forceOpen={q !== "" || group !== null || region !== null}
                listClassName="flex flex-col gap-1"
                renderItem={(e) => (
                  <li key={e.id}>
                    <button
                      className="min-h-9 w-full rounded-panel px-3 py-1.5 text-left text-caption hover:bg-surface-muted disabled:text-text-secondary"
                      // El nombre es el del ejercicio (con su tipo, como se ve); los
                      // músculos van de descripción, no pegados al nombre.
                      aria-label={`${e.name}${e.kind === "strength" ? "" : ` · ${KIND_LABELS[e.kind]}`}`}
                      aria-describedby={
                        e.regions.length > 0
                          ? `pick-regions-${e.id}`
                          : undefined
                      }
                      disabled={inDraftIds.has(e.id)}
                      onClick={() => {
                        if (inDraftIds.has(e.id)) return;
                        onAdd(e);
                      }}
                    >
                      {e.name}
                      {e.kind === "strength"
                        ? null
                        : ` · ${KIND_LABELS[e.kind]}`}
                      {e.regions.length > 0 && (
                        <span
                          id={`pick-regions-${e.id}`}
                          className="block text-caption text-text-secondary"
                        >
                          {e.regions.map(regionLabel).join(" · ")}
                        </span>
                      )}
                    </button>
                  </li>
                )}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// --- Editor ----------------------------------------------------------------

/** Fila arrastrable del borrador: asa para reordenar (ratón, táctil o
 *  teclado), objetivos de fuerza o cardio, y quitar. */
function EntryRow({
  entry,
  onPatch,
  onRemove,
}: {
  entry: DraftEntry;
  onPatch: (key: string, targets: Partial<Targets>) => void;
  onRemove: (key: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.key });

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
        aria-label={`Mover ${entry.exerciseName}`}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <Link
        className="min-w-32 font-medium text-primary underline-offset-4 hover:underline"
        to={`/ejercicios/${entry.exerciseId}`}
      >
        {entry.exerciseName}
      </Link>
      {entry.kind === "strength" ? (
        <>
          <label className="text-caption">
            Series
            <Input
              className="w-16"
              type="number"
              min={1}
              value={entry.targetSets ?? ""}
              onChange={(e) =>
                onPatch(entry.key, { targetSets: intAt(e.target.value) })
              }
            />
          </label>
          <label className="text-caption">
            Reps mín
            <Input
              className="w-16"
              type="number"
              min={1}
              value={entry.targetRepsMin ?? ""}
              onChange={(e) =>
                onPatch(entry.key, { targetRepsMin: intAt(e.target.value) })
              }
            />
          </label>
          <label className="text-caption">
            Reps máx
            <Input
              className="w-16"
              type="number"
              min={1}
              value={entry.targetRepsMax ?? ""}
              onChange={(e) =>
                onPatch(entry.key, { targetRepsMax: intAt(e.target.value) })
              }
            />
          </label>
        </>
      ) : (
        <>
          <Badge tone="pending">{KIND_LABELS[entry.kind]}</Badge>
          <label className="text-caption">
            Distancia (km)
            <Input
              className="w-20"
              type="number"
              min={0}
              step="0.1"
              value={entry.targetDistanceKm ?? ""}
              onChange={(e) =>
                onPatch(entry.key, { targetDistanceKm: numAt(e.target.value) })
              }
            />
          </label>
          <label className="text-caption">
            Tiempo (min)
            <Input
              className="w-20"
              type="number"
              min={0}
              value={entry.targetDurationMin ?? ""}
              onChange={(e) =>
                onPatch(entry.key, {
                  targetDurationMin: intAt(e.target.value),
                })
              }
            />
          </label>
        </>
      )}
      <Button
        variant="secondary"
        aria-label="Quitar"
        onClick={() => onRemove(entry.key)}
      >
        Quitar
      </Button>
    </li>
  );
}

/** Modal de plantilla: un único diálogo con el nombre, la lista ordenable de
 *  ejercicios y el selector embebido. Guardar persiste el borrador completo;
 *  Cancelar, Escape o el fondo cierran sin llamadas a la API. */
function TemplateDialog({
  draft: initial,
  title,
  submitting,
  onSave,
  onCancel,
}: {
  draft: Draft;
  title: string;
  submitting: boolean;
  onSave: (draft: Draft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const sensors = useDragSensors();
  const { exercises } = useExercises();

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // Escape cancela el arrastre de teclado (dnd-kit marca el evento como
      // gestionado); solo cerramos la modal si nadie lo consumió antes.
      if (ev.key === "Escape" && !ev.defaultPrevented) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const save = async () => {
    if (submitting) return;
    if (!draft.name.trim()) {
      setNameError("El nombre es obligatorio");
      return;
    }
    setNameError(null);
    setServerError(null);
    try {
      await onSave(draft);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      if (apiField(e) === "name") setNameError(msg);
      else setServerError(msg);
    }
  };

  const announcements = sortableAnnouncements(
    (id) => draft.entries.find((e) => e.key === id)?.exerciseName ?? "",
    (id) => draft.entries.findIndex((e) => e.key === id) + 1,
  );

  /** El orden del borrador es el de `position` en el payload. */
  const moveRow = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = draft.entries.findIndex((e) => e.key === active.id);
    const to = draft.entries.findIndex((e) => e.key === over.id);
    if (from < 0 || to < 0) return;
    setDraft(moveEntry(draft, from, to));
  };

  const add = (e: Exercise) =>
    setDraft(
      addEntry(draft, {
        key: newEntryKey(),
        exerciseId: e.id,
        exerciseName: e.name,
        kind: e.kind,
        targetSets: null,
        targetRepsMin: null,
        targetRepsMax: null,
        targetDistanceKm: null,
        targetDurationMin: null,
      }),
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* Alto fijo (no `max-h`): la modal guarda el mismo espacio aunque el
          borrador o la lista del selector cambien de tamaño. */}
      <div className="w-full max-w-6xl">
        <Card
          role="dialog"
          aria-modal="true"
          aria-labelledby="tpl-editor-title"
          className="flex h-[88vh] flex-col gap-3"
        >
          <header className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
            <h2 id="tpl-editor-title" className="text-lead font-bold">
              {title}
            </h2>
            <div className="flex min-w-48 flex-1 flex-col gap-1 text-caption">
              <label htmlFor="tpl-name">Nombre</label>
              <Input
                id="tpl-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              {nameError && (
                <span className="text-caption text-error">{nameError}</span>
              )}
            </div>
          </header>

          {serverError && (
            <p className="text-caption text-error">{serverError}</p>
          )}

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 md:grid-cols-2 md:grid-rows-1">
            <section className="flex min-h-0 flex-col gap-2">
              <h3 className="section-label">Ejercicios de la plantilla</h3>
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
                  items={draft.entries.map((e) => e.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul
                    aria-label="Ejercicios de la plantilla"
                    className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-panel border border-border bg-surface-muted/50"
                  >
                    {draft.entries.map((entry) => (
                      <EntryRow
                        key={entry.key}
                        entry={entry}
                        onPatch={(key, targets) =>
                          setDraft(setTargets(draft, key, targets))
                        }
                        onRemove={(key) => setDraft(removeEntry(draft, key))}
                      />
                    ))}
                    {draft.entries.length === 0 && (
                      <li className="bg-surface p-3 text-text-secondary">
                        Aún no hay ejercicios. Añádelos desde la lista de la
                        derecha.
                      </li>
                    )}
                  </ul>
                </SortableContext>
              </DndContext>
            </section>

            <ExercisePicker
              exercises={exercises}
              draftEntries={draft.entries}
              onAdd={add}
            />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button disabled={submitting} onClick={save}>
              {submitting ? "Guardando…" : "Guardar"}
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  expanded,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: Template;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => Promise<string | null>;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = template.exercises.length;

  return (
    <section
      data-expanded={String(expanded)}
      className={cardClass("flex flex-col gap-3", expanded && "xl:col-span-2")}
    >
      <header className="flex items-center justify-between gap-2">
        <button
          className="flex min-w-0 items-center gap-2 text-left"
          aria-label={template.name}
          onClick={onToggle}
        >
          <span className="truncate text-lead font-semibold">
            {template.name}
          </span>
        </button>
        <button
          className="min-h-11 px-1 text-text-secondary"
          aria-label={expanded ? "Contraer" : "Expandir"}
          onClick={onToggle}
        >
          <span aria-hidden>{expanded ? "▾" : "▸"}</span>
        </button>
      </header>

      {expanded ? (
        <ul className="overflow-hidden rounded-panel border border-border bg-surface-muted/50">
          {template.exercises.map((e, i) => {
            const info = targetSummary(e);
            return (
              <li
                key={e.id}
                className={`flex min-h-12 items-center gap-3 bg-surface px-3 ${
                  i < template.exercises.length - 1
                    ? "border-b border-border"
                    : ""
                }`}
              >
                <button
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left font-medium"
                  onClick={() => navigate(`/ejercicios/${e.exerciseId}`)}
                >
                  <span className="truncate">{e.exerciseName}</span>
                  {info ? (
                    <span className="shrink-0 text-caption text-text-secondary">
                      {info}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {template.exercises.length === 0 && (
            <li className="bg-surface p-3 text-text-secondary">
              Sin ejercicios todavía.
            </li>
          )}
        </ul>
      ) : (
        <p className="text-text-secondary">
          {count} {count === 1 ? "ejercicio" : "ejercicios"}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onEdit}>
          Editar
        </Button>
        <Button variant="secondary" onClick={onDuplicate}>
          Duplicar
        </Button>
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Eliminar
        </Button>
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center gap-2">
          <span>¿Eliminar {template.name}?</span>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              const msg = await onDelete();
              if (msg) {
                setError(msg);
                setConfirming(false);
              }
            }}
          >
            Confirmar
          </Button>
        </div>
      )}
      {error && <p className="text-caption text-error">{error}</p>}
    </section>
  );
}

// --- Page ------------------------------------------------------------------

export function PlantillasPage() {
  const {
    templates,
    pending,
    error,
    reload,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = useTemplates();
  const navigate = useNavigate();
  const nueva = useMatch("/plantillas/nueva");
  const editando = useMatch("/plantillas/:id/editar");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // La modal sale de la URL: recargar la reabre y «atrás» la cierra.
  const editing = editando
    ? templates.find((t) => t.id === Number(editando.params.id))
    : undefined;

  const close = () => navigate("/plantillas");

  const save = async (draft: Draft) => {
    setSubmitting(true);
    try {
      const payload = buildTemplatePayload(draft);
      const saved = editing
        ? await updateTemplate(editing.id, payload)
        : await createTemplate(payload);
      setExpanded((x) => ({ ...x, [saved.id]: true }));
      close();
    } finally {
      setSubmitting(false);
    }
  };

  const duplicate = async (t: Template) => {
    await createTemplate(
      buildTemplatePayload({
        ...toDraft(t),
        name: nextCopyName(
          t.name,
          templates.map((x) => x.name),
        ),
      }),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display font-bold">Plantillas</h1>

      {error && (
        <Card className="flex items-center justify-between">
          <span className="text-error">{error}</span>
          <Button variant="secondary" onClick={reload}>
            Reintentar
          </Button>
        </Card>
      )}

      {pending && templates.length === 0 && !error && (
        <Card>Cargando plantillas…</Card>
      )}

      {!pending && templates.length === 0 && !error && (
        <Card className="text-text-secondary">
          Aún no hay plantillas. Crea tu primera plantilla de sesión.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            expanded={Boolean(expanded[t.id])}
            onToggle={() => setExpanded((x) => ({ ...x, [t.id]: !x[t.id] }))}
            onEdit={() => navigate(`/plantillas/${t.id}/editar`)}
            onDuplicate={() => void duplicate(t)}
            onDelete={async () => {
              try {
                await deleteTemplate(t.id);
                return null;
              } catch (e) {
                return e instanceof Error ? e.message : "Error al eliminar";
              }
            }}
          />
        ))}
      </div>

      <div className="flex justify-center">
        <Button onClick={() => navigate("/plantillas/nueva")}>
          + Nueva plantilla
        </Button>
      </div>

      {(nueva || editing) && (
        <TemplateDialog
          key={editing ? `t${editing.id}` : "nueva"}
          title={editing ? "Editar plantilla" : "Nueva plantilla"}
          draft={editing ? toDraft(editing) : { name: "", entries: [] }}
          submitting={submitting}
          onSave={save}
          onCancel={close}
        />
      )}

      {/* Enlace directo a una plantilla que ya no existe: de vuelta a la lista. */}
      {editando && !editing && !pending && (
        <Navigate to="/plantillas" replace />
      )}
    </div>
  );
}
