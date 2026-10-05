// /plantillas — CRUD de plantillas (agrupaciones semánticas de ejercicios y/o
// cardio, sin rotación). Vivían al pie de /plan-fuerza; ahora tienen su página
// y el planificador solo las usa para expandirlas en un día.
//
// Crear y editar son páginas con URL propia (`/plantillas/nueva` y
// `/plantillas/:id/editar`) con la piel de «Nueva receta»: el borrador se
// compone en dos tarjetas —ejercicios ordenables a la izquierda, selector con
// mapa muscular a la derecha— y se persiste de una sola vez al guardar.
import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { Body3D, hasWebGL } from "../components/body-3d/body-3d";
import { BodyMap, type BodyView } from "../components/body-map/body-map";
import {
  MUSCLE_REGIONS,
  regionLabel,
  regionsOfGroup,
} from "../components/body-map/regions";
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
  Card,
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
import { pushEscape } from "../lib/escape-stack";
import {
  type Exercise,
  KIND_LABELS,
  matchesExercise,
  targetSummary,
  useExercises,
} from "../lib/exercises";
import {
  addEntry,
  buildTemplatePayload,
  DEFAULT_REST_SECS,
  type Draft,
  type DraftEntry,
  intAt,
  moveEntry,
  newEntryKey,
  nextCopyName,
  numAt,
  removeEntry,
  restAt,
  setTargets,
  type Targets,
} from "../lib/template-draft";
import { type Template, useTemplates } from "../lib/templates";
import { morphFrom, useCreateMorph } from "../lib/view-transition";
import { DEFAULT_SETS, setFields } from "../lib/workout";

const toDraft = (t: Template): Draft => ({
  name: t.name,
  entries: t.exercises.map((e) => ({
    key: `s${e.id}`,
    exerciseId: e.exerciseId,
    exerciseName: e.exerciseName,
    kind: e.kind,
    metric: e.metric,
    targetSets: e.targetSets,
    targetRepsMin: e.targetRepsMin,
    targetRepsMax: e.targetRepsMax,
    targetDistanceKm: e.targetDistanceKm,
    targetDurationMin: e.targetDurationMin,
    // 120 s por defecto (lo que ve el borrador es lo que se guarda): vaciar el
    // campo es lo que deja el ejercicio sin descanso programado.
    restSecs: e.restSecs ?? (e.kind === "strength" ? DEFAULT_REST_SECS : null),
    restAfterSecs: e.restAfterSecs ?? DEFAULT_REST_SECS,
  })),
});

/** Posición en la entrada escalonada (`.stagger`). */
const at = (i: number) => ({ ["--i" as string]: i });

// --- Añadir ejercicio (tarjeta del editor) ------------------------------------

/** Selector de ejercicios embebido: vista de mapa corporal (que filtra por
 *  sub-región muscular), fichas de grupo padre, búsqueda y lista agrupada por
 *  músculo. Los dos niveles del filtro son excluyentes. Sin overlay propio: la
 *  página del editor es la que manda. */
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
  // El lienzo 3D no tiene botones: con él, los músculos del grupo elegido (o
  // del músculo elegido) se ofrecen también como fichas, el camino por teclado.
  const [threeD] = useState(hasWebGL);
  const pickRegion = (id: string) => {
    setRegion((r) => (r === id ? null : id));
    setGroup(null);
  };
  const muscleGroup =
    group ?? MUSCLE_REGIONS.find((r) => r.id === region)?.group ?? null;

  const q = search.trim().toLowerCase();
  const picks = exercises.filter(
    (e) =>
      // Dos niveles excluyentes: la sub-región es lo fino y el grupo padre es
      // lo ancho. Como toda sub-región cuelga de un grupo que el ejercicio
      // tiene como tag, filtrar por el grupo devuelve también sus sub-regiones.
      (region === null || e.regions.some((r) => r.region === region)) &&
      (group === null || e.tags.includes(group)) &&
      matchesExercise(
        e,
        search,
        e.regions.map((r) => regionLabel(r.region)),
      ),
  );
  const inDraftIds = new Set(draftEntries.map((en) => en.exerciseId));
  const filter = region
    ? regionLabel(region)
    : group
      ? (GROUP_LABELS[group] ?? group)
      : null;

  return (
    <section
      aria-labelledby="pick-title"
      className="flex min-w-0 flex-col gap-3"
    >
      <h2 id="pick-title" className="text-title-m">
        Añadir ejercicio
      </h2>

      {/* El modelo manda: su alto fija el tamaño de sus músculos; la lista
          crece debajo y la página se desplaza como cualquier otra. */}
      <div className="rounded-l bg-surface-container-high p-3">
        <Body3D
          regions={region ? [{ region, role: "primary" }] : []}
          onSelect={pickRegion}
          view={view}
          className="h-96 w-full"
          fallback={
            <div className="flex justify-center">
              <BodyMap
                view={view}
                regions={region ? [{ region, role: "primary" }] : []}
                onSelect={pickRegion}
                className="h-96 w-auto max-w-full"
              />
            </div>
          }
        />
      </div>

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

      {threeD && muscleGroup && (
        <div
          role="group"
          aria-labelledby="pick-muscles-label"
          className="flex flex-wrap items-center gap-2"
        >
          <span
            id="pick-muscles-label"
            className="text-label-l text-on-surface-variant"
          >
            Músculo:
          </span>
          {regionsOfGroup(muscleGroup).map((r) => (
            <Chip
              key={r.id}
              pressed={region === r.id}
              onClick={() => pickRegion(r.id)}
            >
              {region === r.id && <CheckIcon width={18} height={18} />}
              {r.label}
            </Chip>
          ))}
        </div>
      )}

      <p className="px-1 text-body-m text-on-surface-variant">
        {region ? `Músculo: ${filter}` : `Grupo: ${filter ?? "Todos"}`}
      </p>

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
                    e.regions.length > 0 ? `pick-regions-${e.id}` : undefined
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
                    {e.kind === "strength" ? null : ` · ${KIND_LABELS[e.kind]}`}
                    {e.regions.length > 0 && (
                      <span
                        id={`pick-regions-${e.id}`}
                        className="block text-body-s text-on-surface-variant"
                      >
                        {e.regions
                          .map((r) => regionLabel(r.region))
                          .join(" · ")}
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
    extra?: { min?: number; step?: string; placeholder?: string },
  ) => (
    <label className="flex flex-col gap-1 text-label-m text-on-surface-variant">
      {label}
      <Input
        className="w-20 px-3 text-center tabular"
        type="number"
        min={extra?.min ?? 1}
        step={extra?.step}
        placeholder={extra?.placeholder}
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
            {/* Los ejercicios por tiempo no se prescriben en repeticiones. */}
            {setFields(entry.metric).reps && (
              <>
                {target("Reps mín", entry.targetRepsMin, (v) => ({
                  targetRepsMin: intAt(v),
                }))}
                {target("Reps máx", entry.targetRepsMax, (v) => ({
                  targetRepsMax: intAt(v),
                }))}
              </>
            )}
            {target(
              "Descanso entre series (s)",
              entry.restSecs,
              (v) => ({ restSecs: restAt(v) }),
              { placeholder: "120" },
            )}
            {target(
              "Descanso al terminar (s)",
              entry.restAfterSecs,
              (v) => ({ restAfterSecs: restAt(v) }),
              { placeholder: "120" },
            )}
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
            {target(
              "Descanso al terminar (s)",
              entry.restAfterSecs,
              (v) => ({ restAfterSecs: restAt(v) }),
              { placeholder: "120" },
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** Editor de plantilla (crear y editar): página con la piel de «Nueva receta»
 *  —el nombre y la lista ordenable de ejercicios en una tarjeta, el selector
 *  embebido en la otra—. Guardar persiste el borrador completo; Cancelar o
 *  Escape vuelven a la lista sin llamadas a la API. */
function TemplateEditor({
  draft: initial,
  title,
  create,
  submitting,
  onSave,
  onCancel,
}: {
  draft: Draft;
  title: string;
  /** Crear: lo pulsado (FAB o «Nueva plantilla») se transforma en la página. */
  create: boolean;
  submitting: boolean;
  onSave: (draft: Draft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const sensors = useDragSensors();
  const { exercises } = useExercises();
  const morph = useCreateMorph(create);

  // Escape vuelve a la lista sin guardar. Un arrastre de teclado lo cancela
  // dnd-kit y marca el evento como gestionado: la pila lo ignora y la página
  // sigue abierta.
  useEffect(() => pushEscape(onCancel), [onCancel]);
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
        metric: e.metric,
        targetSets: e.kind === "strength" ? DEFAULT_SETS : null,
        targetRepsMin: null,
        targetRepsMax: null,
        targetDistanceKm: null,
        targetDurationMin: null,
        restSecs: e.kind === "strength" ? DEFAULT_REST_SECS : null,
        restAfterSecs: DEFAULT_REST_SECS,
      }),
    );

  const count = draft.entries.length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4" style={morph}>
      <header className="relative flex flex-col items-start gap-5 rounded-xl rounded-tr-xxl bg-accent-container p-6 text-on-accent-container sm:flex-row sm:items-end sm:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl rounded-tr-xxl"
        >
          <Shape
            name="cookie-12"
            size={176}
            className="absolute -top-14 -right-12 text-accent opacity-15"
          />
          <Shape
            name="clover"
            size={72}
            className="absolute right-36 -bottom-8 rotate-12 text-accent opacity-10"
          />
        </div>
        <div className="relative flex min-w-0 items-center gap-4">
          <Shape name="cookie-9" size={56} className="text-accent">
            <ListIcon className="text-on-accent" />
          </Shape>
          <div className="min-w-0">
            <h1 className="text-headline-l text-e">{title}</h1>
            <p className="text-body-m">
              Ejercicios y objetivos en una sola página.
            </p>
          </div>
        </div>
        <div className="relative flex flex-wrap gap-2">
          <Button
            variant="text"
            className="text-on-accent-container"
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button disabled={submitting} onClick={save}>
            <SaveIcon width={20} height={20} />
            {submitting ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </header>

      {serverError && <Alert>{serverError}</Alert>}

      <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex min-w-0 flex-col gap-6 rounded-xl" style={at(0)}>
          <Field
            label="Nombre"
            support="Así aparecerá al planificar una sesión"
            error={nameError}
          >
            {(a) => (
              <Input
                {...a}
                className="text-title-m"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            )}
          </Field>

          <section className="flex flex-col gap-3">
            <h2 className="text-title-m">Ejercicios de la plantilla</h2>
            <p
              aria-live="polite"
              className="text-body-m text-on-surface-variant tabular"
            >
              {count} {count === 1 ? "ejercicio" : "ejercicios"}
            </p>
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
                  className="flex flex-col gap-2"
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
        </Card>

        <Card className="min-w-0 rounded-xl" style={at(1)}>
          <ExercisePicker
            exercises={exercises}
            draftEntries={draft.entries}
            onAdd={add}
          />
        </Card>
      </div>
    </div>
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

// --- Pages -----------------------------------------------------------------

/** Lista de plantillas. Crear y editar son rutas propias (abajo), así que esta
 *  página se desmonta al abrir el editor y no queda detrás. */
export function PlantillasPage() {
  const { templates, pending, error, reload, createTemplate, deleteTemplate } =
    useTemplates();
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  // Guardar vuelve aquí con el id en el state de la navegación: su tarjeta
  // llega desplegada.
  const savedId = (location.state as { expand?: number } | null)?.expand;
  useEffect(() => {
    if (savedId) setExpanded((x) => ({ ...x, [savedId]: true }));
  }, [savedId]);

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
          aria-label="+ Nueva plantilla"
          onClick={(e) => {
            morphFrom(e.currentTarget);
            navigate("/plantillas/nueva", { viewTransition: true });
          }}
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
    </div>
  );
}

/** Editor de plantilla (crear y editar): la lista le cede la página entera. Al
 *  editar espera a las plantillas (necesita el borrador de partida) y, si la
 *  del enlace ya no existe, vuelve a la lista. */
export function PlantillaEditorPage() {
  const { templates, pending, createTemplate, updateTemplate } = useTemplates();
  const navigate = useNavigate();
  const { id } = useParams();
  const [submitting, setSubmitting] = useState(false);

  const editing = id ? templates.find((t) => t.id === Number(id)) : undefined;

  const close = useCallback(() => navigate("/plantillas"), [navigate]);

  const save = async (draft: Draft) => {
    setSubmitting(true);
    try {
      const payload = buildTemplatePayload(draft);
      const saved = editing
        ? await updateTemplate(editing.id, payload)
        : await createTemplate(payload);
      // El id viaja a la lista: su tarjeta se abre al llegar.
      navigate("/plantillas", { state: { expand: saved.id } });
    } finally {
      setSubmitting(false);
    }
  };

  if (id && pending) return <Loader label="Cargando plantilla…" />;
  if (id && !editing) return <Navigate to="/plantillas" replace />;

  return (
    <TemplateEditor
      key={editing ? `t${editing.id}` : "nueva"}
      title={editing ? "Editar plantilla" : "Nueva plantilla"}
      create={!editing}
      draft={editing ? toDraft(editing) : { name: "", entries: [] }}
      submitting={submitting}
      onSave={save}
      onCancel={close}
    />
  );
}
