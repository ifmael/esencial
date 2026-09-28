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
import { useState } from "react";
import { Link, Navigate, useMatch, useNavigate } from "react-router";
import { BodyMap, type BodyView } from "../components/body-map/body-map";
import { regionLabel } from "../components/body-map/regions";
import { EmptyState, Loader, Monogram, Shape } from "../components/expressive";
import {
  GROUP_LABELS,
  GroupedExercises,
  MUSCLE_GROUPS,
} from "../components/grouped-exercises";
import {
  AddIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  DeleteIcon,
  EditIcon,
  ListIcon,
  SaveIcon,
} from "../components/icons";
import { Dialog } from "../components/overlay";
import {
  DRAG_INSTRUCTIONS,
  DragHandle,
  sortableAnnouncements,
  useDragSensors,
} from "../components/sortable";
import {
  Alert,
  Badge,
  Button,
  Chip,
  ConnectedGroup,
  ConnectedItem,
  cardClass,
  cx,
  Field,
  Input,
  ripple,
  SearchBar,
} from "../components/ui";
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
      className="flex min-h-0 flex-col gap-3 rounded-xl bg-surface-container-low p-3"
    >
      <h3 className="section-label px-1">Añadir ejercicio</h3>

      {/* Desde `md`, el dibujo se lleva el alto libre de la columna y la lista el
          suyo (crece con la modal en vez de encogerse por la lista). En móvil se
          apila y el conjunto se desplaza, como antes. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:flex-row md:overflow-visible">
        <div className="flex shrink-0 justify-center rounded-l bg-surface-container px-2">
          <BodyMap
            view={view}
            regions={region ? [region] : []}
            onSelect={(id) => {
              setRegion((r) => (r === id ? null : id));
              setGroup(null);
            }}
          />
        </div>

        <div className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:overflow-y-auto">
          <SearchBar
            tone="high"
            aria-label="Buscar ejercicio"
            placeholder="Buscar ejercicio"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ConnectedGroup label="Vista">
            <ConnectedItem
              pressed={view === "front"}
              className="min-h-12"
              onClick={() => setView("front")}
            >
              Frontal
            </ConnectedItem>
            <ConnectedItem
              pressed={view === "back"}
              className="min-h-12"
              onClick={() => setView("back")}
            >
              Trasera
            </ConnectedItem>
          </ConnectedGroup>

          <div
            role="group"
            aria-labelledby="pick-groups-label"
            className="flex flex-wrap items-center gap-2"
          >
            <span
              id="pick-groups-label"
              className="text-label-l text-on-surface-variant"
            >
              Grupo:
            </span>
            <Chip
              pressed={filter === null}
              onClick={() => {
                setRegion(null);
                setGroup(null);
              }}
            >
              {filter === null && <CheckIcon width={18} height={18} />}
              Todos
            </Chip>
            {MUSCLE_GROUPS.map((g) => (
              <Chip
                key={g}
                pressed={group === g}
                onClick={() => {
                  setGroup((prev) => (prev === g ? null : g));
                  setRegion(null);
                }}
              >
                {group === g && <CheckIcon width={18} height={18} />}
                {GROUP_LABELS[g]}
              </Chip>
            ))}
          </div>

          <p className="px-1 text-body-m text-on-surface-variant">
            {region ? `Músculo: ${filter}` : `Grupo: ${filter ?? "Todos"}`}
          </p>

          <div className="min-h-0 md:flex-1 md:overflow-y-auto">
            {picks.length === 0 ? (
              <EmptyState
                title="Sin ejercicios"
                shapes={["soft-diamond", "cookie-4", "clover"]}
              />
            ) : (
              <GroupedExercises
                exercises={picks}
                forceOpen={q !== "" || group !== null || region !== null}
                listClassName="flex flex-col gap-0.5"
                renderItem={(e) => {
                  const taken = inDraftIds.has(e.id);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        className="state flex min-h-12 w-full items-center gap-3 rounded-m px-3 py-2 text-left text-body-l transition-colors motion-effects disabled:text-on-surface-variant"
                        // El nombre es el del ejercicio (con su tipo, como se ve); los
                        // músculos van de descripción, no pegados al nombre.
                        aria-label={`${e.name}${e.kind === "strength" ? "" : ` · ${KIND_LABELS[e.kind]}`}`}
                        aria-describedby={
                          e.regions.length > 0
                            ? `pick-regions-${e.id}`
                            : undefined
                        }
                        disabled={taken}
                        onPointerDown={ripple}
                        onClick={() => {
                          if (taken) return;
                          onAdd(e);
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          {e.name}
                          {e.kind === "strength"
                            ? null
                            : ` · ${KIND_LABELS[e.kind]}`}
                          {e.regions.length > 0 && (
                            <span
                              id={`pick-regions-${e.id}`}
                              className="block text-body-s text-on-surface-variant"
                            >
                              {e.regions.map(regionLabel).join(" · ")}
                            </span>
                          )}
                        </span>
                        {taken ? (
                          <CheckIcon className="shrink-0 text-accent" />
                        ) : (
                          <AddIcon className="shrink-0 text-on-surface-variant" />
                        )}
                      </button>
                    </li>
                  );
                }}
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

  const target = (
    label: string,
    value: number | null,
    patch: (raw: string) => Partial<Targets>,
    extra?: { min?: number; step?: string },
  ) => (
    <label className="flex flex-col gap-1 text-label-m text-on-surface-variant">
      {label}
      <Input
        className="w-20 px-3 text-center tabular"
        type="number"
        min={extra?.min ?? 1}
        step={extra?.step}
        value={value ?? ""}
        onChange={(e) => onPatch(entry.key, patch(e.target.value))}
      />
    </label>
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        "flex flex-col gap-1 rounded-l bg-surface-container-highest py-1 pr-1 pl-1",
        isDragging && "relative z-10 shadow-2",
      )}
    >
      <div className="flex items-center gap-1">
        <DragHandle
          label={`Mover ${entry.exerciseName}`}
          {...attributes}
          {...listeners}
        />
        <Link
          className="inline-flex min-h-12 min-w-0 flex-1 items-center text-title-m text-accent underline-offset-4 hover:underline"
          to={`/ejercicios/${entry.exerciseId}`}
        >
          <span className="truncate">{entry.exerciseName}</span>
        </Link>
        {entry.kind !== "strength" && (
          <Badge tone="pending">{KIND_LABELS[entry.kind]}</Badge>
        )}
        <Button
          variant="text"
          size="icon"
          className="text-on-surface-variant"
          aria-label="Quitar"
          onClick={() => onRemove(entry.key)}
        >
          <CloseIcon />
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2 pb-2 pl-12">
        {entry.kind === "strength" ? (
          <>
            {target("Series", entry.targetSets, (v) => ({
              targetSets: intAt(v),
            }))}
            {target("Reps mín", entry.targetRepsMin, (v) => ({
              targetRepsMin: intAt(v),
            }))}
            {target("Reps máx", entry.targetRepsMax, (v) => ({
              targetRepsMax: intAt(v),
            }))}
          </>
        ) : (
          <>
            {target(
              "Distancia (km)",
              entry.targetDistanceKm,
              (v) => ({ targetDistanceKm: numAt(v) }),
              { min: 0, step: "0.1" },
            )}
            {target(
              "Tiempo (min)",
              entry.targetDurationMin,
              (v) => ({ targetDurationMin: intAt(v) }),
              { min: 0 },
            )}
          </>
        )}
      </div>
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

  const count = draft.entries.length;

  return (
    <Dialog
      // Escape durante un arrastre de teclado lo cancela dnd-kit (marca el
      // evento como gestionado): entonces la modal sigue abierta.
      onClose={() => {
        if (!window.event?.defaultPrevented) onCancel();
      }}
      labelledBy="tpl-editor-title"
      // Alto fijo (no `max-h`) desde `md`: la modal guarda el mismo espacio
      // aunque el borrador o la lista del selector cambien de tamaño.
      className="gap-4 overflow-hidden md:h-[88vh] md:max-w-6xl"
    >
      <header className="flex flex-wrap items-center gap-4 px-6 pt-6">
        <Shape name="cookie-9" size={48} className="text-accent-container">
          <ListIcon className="text-on-accent-container" />
        </Shape>
        <h2 id="tpl-editor-title" className="text-headline-s text-e">
          {title}
        </h2>
        <Field
          label="Nombre"
          error={nameError}
          // La etiqueta flotante tapa el borde con el tono del diálogo.
          className="min-w-48 flex-1"
        >
          {(a) => (
            <Input
              {...a}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          )}
        </Field>
      </header>

      {serverError && <Alert className="mx-6">{serverError}</Alert>}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 px-6 md:grid-cols-2 md:grid-rows-1">
        <section className="flex min-h-0 flex-col gap-2">
          <h3 className="section-label px-1">Ejercicios de la plantilla</h3>
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
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
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
                {count === 0 && (
                  <li className="rounded-xl bg-surface-container">
                    <EmptyState title="Aún no hay ejercicios">
                      <p className="text-body-m text-on-surface-variant">
                        Añádelos desde el selector.
                      </p>
                    </EmptyState>
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

      {/* Barra de herramientas flotante M3E: el recuento del borrador y sus
          dos salidas, siempre a mano al pie del diálogo. */}
      <div
        role="toolbar"
        aria-label="Acciones de la plantilla"
        className="toolbar mx-auto mb-[max(1rem,env(safe-area-inset-bottom))] flex shrink-0 items-center gap-1 p-2"
      >
        <span
          aria-live="polite"
          className="px-3 text-label-l text-on-surface-variant tabular"
        >
          {count} {count === 1 ? "ejercicio" : "ejercicios"}
        </span>
        <Button variant="text" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={submitting} onClick={save}>
          <SaveIcon />
          {submitting ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </Dialog>
  );
}

function TemplateCard({
  template,
  index,
  expanded,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: Template;
  index: number;
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
      style={{ ["--i" as string]: index }}
      className={cardClass(
        "tonal",
        "flex flex-col gap-3 rounded-xl transition-[border-radius,background-color] motion-spatial",
        expanded && "rounded-tr-xxl bg-surface-container-high xl:col-span-2",
      )}
    >
      <header className="flex items-center gap-3">
        <Monogram name={template.name} size={48} />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-label={template.name}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <span className="block truncate text-title-l text-e">
            {template.name}
          </span>
        </button>
        <Button
          variant="text"
          size="icon"
          className="text-on-surface-variant"
          aria-label={expanded ? "Contraer" : "Expandir"}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <ChevronDownIcon
            className={cx(
              "transition-transform motion-spatial-fast",
              expanded && "rotate-180",
            )}
          />
        </Button>
      </header>

      {expanded && (
        <ul className="flex flex-col gap-0.5 overflow-hidden rounded-l">
          {template.exercises.map((e) => {
            const info = targetSummary(e);
            return (
              <li key={e.id} className="bg-surface-container-lowest">
                <button
                  type="button"
                  className="state flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-body-l"
                  onPointerDown={ripple}
                  onClick={() => navigate(`/ejercicios/${e.exerciseId}`)}
                >
                  <span className="truncate">{e.exerciseName}</span>
                  {info ? (
                    <span className="shrink-0 text-body-m text-on-surface-variant tabular">
                      {info}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {count === 0 && (
            <li className="bg-surface-container-lowest px-4 py-3 text-body-m text-on-surface-variant">
              Sin ejercicios todavía.
            </li>
          )}
        </ul>
      )}

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1 text-body-m">¿Eliminar {template.name}?</span>
          <Button variant="text" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
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
      ) : (
        <footer className="flex items-center gap-1">
          <span className="flex-1 text-body-m text-on-surface-variant tabular">
            {count} {count === 1 ? "ejercicio" : "ejercicios"}
          </span>
          <Button
            variant="text"
            size="icon"
            aria-label="Editar"
            onClick={onEdit}
          >
            <EditIcon />
          </Button>
          <Button
            variant="text"
            size="icon"
            aria-label="Duplicar"
            onClick={onDuplicate}
          >
            <CopyIcon />
          </Button>
          <Button
            variant="text"
            size="icon"
            className="text-error"
            aria-label="Eliminar"
            onClick={() => setConfirming(true)}
          >
            <DeleteIcon />
          </Button>
        </footer>
      )}
      {error && <Alert>{error}</Alert>}
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-headline-l text-e">Plantillas</h1>
          {templates.length > 0 && (
            <p className="text-body-l text-on-surface-variant tabular">
              {templates.length}{" "}
              {templates.length === 1 ? "plantilla" : "plantillas"}
            </p>
          )}
        </div>
        {/* El nombre conserva el «+» que ya buscan los tests y el e2e. */}
        <Button
          size="lg"
          aria-label="+ Nueva plantilla"
          onClick={() => navigate("/plantillas/nueva")}
        >
          <AddIcon />
          Nueva plantilla
        </Button>
      </header>

      {error && (
        <Alert>
          <p>{error}</p>
          <Button variant="outlined" onClick={reload}>
            Reintentar
          </Button>
        </Alert>
      )}

      {pending && templates.length === 0 && !error && (
        <Loader label="Cargando plantillas…" />
      )}

      {!pending && templates.length === 0 && !error && (
        <EmptyState title="Aún no hay plantillas">
          <p className="text-body-l text-on-surface-variant">
            Crea tu primera plantilla de sesión.
          </p>
        </EmptyState>
      )}

      <div className="stagger grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {templates.map((t, i) => (
          <TemplateCard
            key={t.id}
            index={i}
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
