// /ejercicios + /ejercicios/:id — catálogo del banco de ejercicios (E4).
// Diseño D4: "Ver técnica" acepta cualquier URL; los enlaces de YouTube se empotran (E8).
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BodyMap } from "../components/body-map/body-map";
import {
  type MuscleRegion,
  regionLabel,
  regionsOfGroup,
} from "../components/body-map/regions";
import { EmptyState, Loader, Monogram, Shape } from "../components/expressive";
import { GROUP_LABELS, MUSCLE_GROUPS } from "../components/grouped-exercises";
import {
  AddIcon,
  BackIcon,
  BikeIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  DeleteIcon,
  DumbbellIcon,
  EditIcon,
  ListIcon,
  PlayIcon,
  RunIcon,
  SaveIcon,
} from "../components/icons";
import { Dialog } from "../components/overlay";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  Chip,
  cardClass,
  Field,
  Input,
  ripple,
  SearchBar,
  Select,
  Textarea,
} from "../components/ui";
import { apiField } from "../lib/api";
import {
  type Exercise,
  type ExerciseInput,
  type ExerciseKind,
  KIND_LABELS,
  useExercises,
} from "../lib/exercises";
import type { ShapeName } from "../lib/shapes";
import {
  type Template,
  type TemplatesState,
  useTemplates,
} from "../lib/templates";

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : "Error inesperado";

const ytEmbedId = (url: string): string | null =>
  url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/,
  )?.[1] ?? null;

const KIND_ICON: Record<ExerciseKind, typeof DumbbellIcon> = {
  strength: DumbbellIcon,
  running: RunIcon,
  bike: BikeIcon,
};

/** Formas de los números de paso: una distinta por paso, en bucle. */
const STEP_SHAPES: ShapeName[] = [
  "cookie-4",
  "soft-diamond",
  "clover",
  "cookie-7",
  "flower",
  "sunny",
];

const TagChips = ({
  tags,
  tone = "neutral",
}: {
  tags: string[];
  tone?: "neutral" | "accent";
}) => (
  <ul className="flex flex-wrap gap-1" aria-label="Grupos">
    {tags.map((t) => (
      <li key={t}>
        <Badge tone={tone}>{t}</Badge>
      </li>
    ))}
  </ul>
);

// --- Editor (create + edit) --------------------------------------------------

type Draft = {
  name: string;
  description: string;
  setupCues: string;
  techniqueUrl: string;
  steps: string;
  tags: string[];
  regions: string[];
  kind: ExerciseKind;
};

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  setupCues: "",
  techniqueUrl: "",
  steps: "",
  tags: [],
  regions: [],
  kind: "strength",
});

const toDraft = (x: Exercise): Draft => ({
  name: x.name,
  description: x.description ?? "",
  setupCues: x.setupCues ?? "",
  techniqueUrl: x.techniqueUrl ?? "",
  steps: x.steps?.join("\n") ?? "",
  tags: [...x.tags],
  regions: [...x.regions],
  kind: x.kind,
});

const toInput = (d: Draft): ExerciseInput => {
  const steps = d.steps
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  return {
    name: d.name.trim(),
    description: d.description || null,
    setupCues: d.setupCues || null,
    techniqueUrl: d.techniqueUrl || null,
    steps: steps.length ? steps : null,
    tags: d.tags,
    regions: d.regions,
    kind: d.kind,
  };
};

type FieldErrors = {
  name?: string;
  tags?: string;
  regions?: string;
  techniqueUrl?: string;
};

function ExerciseEditor({
  title,
  initial,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial: Draft;
  onSubmit: (input: ExerciseInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [tagText, setTagText] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const addTag = () => {
    const t = tagText.trim();
    if (t && !draft.tags.includes(t))
      setDraft({ ...draft, tags: [...draft.tags, t] });
    setTagText("");
  };

  const toggleRegion = (region: MuscleRegion) => {
    const on = draft.regions.includes(region.id);
    setDraft({
      ...draft,
      regions: on
        ? draft.regions.filter((x) => x !== region.id)
        : [...draft.regions, region.id],
      // Toda sub-región cuelga de su grupo: elegirla añade el tag si falta.
      tags: draft.tags.includes(region.group)
        ? draft.tags
        : [...draft.tags, region.group],
    });
  };

  /** Quitar un grupo se lleva sus músculos: sin él no colgarían de nada. */
  const removeTag = (tag: string) => {
    const orphans = new Set(regionsOfGroup(tag).map((r) => r.id));
    setDraft({
      ...draft,
      tags: draft.tags.filter((x) => x !== tag),
      regions: draft.regions.filter((id) => !orphans.has(id)),
    });
  };

  const save = async () => {
    if (submitting) return;
    const errs: FieldErrors = {};
    if (!draft.name.trim()) errs.name = "El nombre es obligatorio";
    if (draft.tags.length < 1) errs.tags = "Al menos un tag es obligatorio";
    if (draft.regions.length < 1) errs.regions = "Elige al menos un músculo";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try {
      await onSubmit(toInput(draft));
    } catch (e) {
      // Envelope-driven (D6): el mensaje del servidor va junto al campo que falló.
      const field = apiField(e);
      setErrors(
        field === "techniqueUrl" ||
          field === "name" ||
          field === "tags" ||
          field === "regions"
          ? { [field]: errorMessage(e) }
          : {},
      );
      setSubmitting(false);
    }
  };

  const muscleGroups = draft.tags.filter((t) => regionsOfGroup(t).length > 0);

  return (
    <Card className="flex flex-col gap-6 rounded-xl animate-rise">
      <h2 className="text-headline-s text-e">{title}</h2>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Nombre" error={errors.name}>
          {(a) => (
            <Input
              {...a}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          )}
        </Field>
        <Field label="Tipo">
          {(a) => (
            <Select
              {...a}
              value={draft.kind}
              onChange={(e) =>
                setDraft({ ...draft, kind: e.target.value as ExerciseKind })
              }
            >
              {(Object.keys(KIND_LABELS) as ExerciseKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Descripción">
          {(a) => (
            <Textarea
              {...a}
              rows={3}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          )}
        </Field>
        <Field label="Claves de preparación">
          {(a) => (
            <Textarea
              {...a}
              rows={3}
              value={draft.setupCues}
              onChange={(e) =>
                setDraft({ ...draft, setupCues: e.target.value })
              }
            />
          )}
        </Field>
        <Field
          label="Pasos de ejecución"
          support="Un paso por línea"
          className="md:col-span-2"
        >
          {(a) => (
            <Textarea
              {...a}
              rows={4}
              value={draft.steps}
              onChange={(e) => setDraft({ ...draft, steps: e.target.value })}
            />
          )}
        </Field>
        <Field
          label="Técnica (URL de YouTube)"
          support="Un vídeo de YouTube se ve aquí dentro; cualquier otra URL, como enlace."
          error={errors.techniqueUrl}
          className="md:col-span-2"
        >
          {(a) => (
            <Input
              {...a}
              inputMode="url"
              value={draft.techniqueUrl}
              onChange={(e) =>
                setDraft({ ...draft, techniqueUrl: e.target.value })
              }
            />
          )}
        </Field>
      </div>

      <section aria-labelledby="ex-tags-label" className="flex flex-col gap-3">
        <h3 id="ex-tags-label" className="text-title-m">
          Grupos (tags)
        </h3>
        {draft.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {draft.tags.map((t) => (
              <Chip
                key={t}
                aria-label={`Quitar ${GROUP_LABELS[t] ?? t}`}
                onClick={() => removeTag(t)}
                className="pr-2"
              >
                {GROUP_LABELS[t] ?? t}
                <CloseIcon width={18} height={18} />
              </Chip>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Añadir tag (p. ej. glúteo)"
            aria-labelledby="ex-tags-label"
            aria-invalid={errors.tags ? true : undefined}
            aria-describedby={errors.tags ? "ex-tags-error" : undefined}
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button
            variant="tonal"
            size="icon"
            aria-label="Añadir tag"
            onClick={addTag}
          >
            <AddIcon />
          </Button>
        </div>
        {errors.tags && (
          <p id="ex-tags-error" className="px-4 text-body-s text-error">
            {errors.tags}
          </p>
        )}
      </section>

      <section
        aria-labelledby="ex-regions-label"
        className="flex flex-col gap-3"
      >
        <h3 id="ex-regions-label" className="text-title-m">
          Músculos
        </h3>
        {errors.regions && (
          <p className="text-body-s text-error">{errors.regions}</p>
        )}
        {muscleGroups.length === 0 ? (
          <p className="text-body-m text-on-surface-variant">
            Añade arriba un grupo muscular para elegir sus músculos.
          </p>
        ) : (
          muscleGroups.map((t) => (
            <fieldset
              key={t}
              className="flex flex-col gap-3 rounded-l bg-surface-container-high p-4"
            >
              <legend className="section-label float-left w-full">
                {GROUP_LABELS[t] ?? t}
              </legend>
              <div className="flex flex-wrap gap-2">
                {regionsOfGroup(t).map((r) => {
                  const on = draft.regions.includes(r.id);
                  return (
                    <Chip
                      key={r.id}
                      pressed={on}
                      onClick={() => toggleRegion(r)}
                    >
                      {on && <CheckIcon width={18} height={18} />}
                      {r.label}
                    </Chip>
                  );
                })}
              </div>
            </fieldset>
          ))
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button disabled={submitting} onClick={save}>
          <SaveIcon width={20} height={20} />
          {submitting ? "Guardando…" : "Guardar"}
        </Button>
        <Button variant="outlined" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}

// --- List page ----------------------------------------------------------------

export function EjerciciosPage() {
  const { exercises, pending, error, reload, createExercise } = useExercises();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const q = search.trim().toLowerCase();
  const groups = MUSCLE_GROUPS.filter((g) =>
    exercises.some((e) => e.tags.includes(g)),
  );
  const shown = exercises.filter(
    (e) =>
      (!group || e.tags.includes(group)) &&
      (!q ||
        e.name.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))),
  );
  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <AddIcon />
      Nuevo ejercicio
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-headline-l text-e">Ejercicios</h1>
          {exercises.length > 0 && (
            <p
              aria-live="polite"
              className="tabular text-body-m text-on-surface-variant"
            >
              {shown.length === exercises.length
                ? `${exercises.length} en el catálogo`
                : `${shown.length} de ${exercises.length}`}
            </p>
          )}
        </div>
        {!creating && exercises.length > 0 && newButton}
      </header>
      {error && (
        <Alert>
          <p className="text-body-m">{error}</p>
          <Button variant="outlined" onClick={reload}>
            Reintentar
          </Button>
        </Alert>
      )}
      {creating ? (
        <ExerciseEditor
          title="Nuevo ejercicio"
          initial={emptyDraft()}
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            const created = await createExercise(input);
            navigate(`/ejercicios/${created.id}`);
          }}
        />
      ) : (
        <>
          <SearchBar
            aria-label="Buscar ejercicios"
            placeholder="Buscar por nombre o tag"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {groups.length > 1 && (
            <fieldset
              aria-label="Filtrar por grupo"
              className="flex flex-wrap gap-2"
            >
              <Chip pressed={group === null} onClick={() => setGroup(null)}>
                {group === null && <CheckIcon width={18} height={18} />}
                Todos
              </Chip>
              {groups.map((g) => (
                <Chip
                  key={g}
                  pressed={group === g}
                  onClick={() => setGroup(group === g ? null : g)}
                >
                  {group === g && <CheckIcon width={18} height={18} />}
                  {GROUP_LABELS[g]}
                </Chip>
              ))}
            </fieldset>
          )}
          {pending && exercises.length === 0 && (
            <Loader label="Cargando ejercicios…" />
          )}
          {!pending && !error && exercises.length === 0 && (
            <EmptyState title="Aún no hay ejercicios">
              <p className="text-body-m text-on-surface-variant">
                Crea tu primer ejercicio y aparecerá aquí.
              </p>
              {newButton}
            </EmptyState>
          )}
          {exercises.length > 0 && shown.length === 0 && (
            <EmptyState
              title="Ningún ejercicio coincide"
              shapes={["soft-diamond", "clover", "pill"]}
            >
              <Button
                variant="tonal"
                onClick={() => {
                  setSearch("");
                  setGroup(null);
                }}
              >
                Quitar filtros
              </Button>
            </EmptyState>
          )}
          <ul className="stagger grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((e, i) => (
              <li key={e.id} style={{ ["--i" as string]: i }}>
                <Link
                  to={`/ejercicios/${e.id}`}
                  onPointerDown={ripple}
                  className={cardClass(
                    "tonal",
                    "card-interactive state flex h-full items-center gap-4",
                  )}
                >
                  <Monogram name={e.name} size={56} />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="line-clamp-2 text-title-m text-e">
                      {e.name}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {e.kind === "strength" ? null : (
                        <Badge tone="pending">{KIND_LABELS[e.kind]}</Badge>
                      )}
                      <TagChips tags={e.tags} />
                    </div>
                  </div>
                  <ChevronRightIcon className="shrink-0 text-on-surface-variant" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// --- Add to template -----------------------------------------------------------

function AddToTemplate({
  exercise,
  state,
}: {
  exercise: Exercise;
  state: TemplatesState;
}) {
  const { templates, pending, updateTemplate } = state;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const add = async (t: Template) => {
    if (picked !== null) return;
    setPicked(t.id);
    setFailed(null);
    setDone(null);
    try {
      await updateTemplate(t.id, {
        name: t.name,
        exercises: [
          ...t.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            targetSets: e.targetSets,
            targetRepsMin: e.targetRepsMin,
            targetRepsMax: e.targetRepsMax,
            targetDistanceKm: e.targetDistanceKm,
            targetDurationMin: e.targetDurationMin,
          })),
          {
            exerciseId: exercise.id,
            targetSets: null,
            targetRepsMin: null,
            targetRepsMax: null,
            targetDistanceKm: null,
            targetDurationMin: null,
          },
        ],
      });
      setDone(t.name);
    } catch (e) {
      setFailed(errorMessage(e));
    } finally {
      setPicked(null);
    }
  };

  return (
    <Card className="flex flex-col gap-4 rounded-xl">
      <div className="flex items-center gap-3">
        <Shape name="pill" size={40} className="text-accent-container">
          <ListIcon
            width={20}
            height={20}
            className="text-on-accent-container"
          />
        </Shape>
        <div className="flex flex-col">
          <h2 className="text-title-m text-e">Plantillas</h2>
          <p className="text-body-s text-on-surface-variant">
            Se añade al final, sin series fijadas.
          </p>
        </div>
      </div>
      <Button
        variant={open ? "tonal" : "filled"}
        aria-expanded={open}
        aria-controls="ex-templates"
        onClick={() => setOpen((o) => !o)}
      >
        <AddIcon />
        Añadir a plantilla
      </Button>
      {open && (
        <div id="ex-templates" className="flex flex-col gap-1">
          {pending && <Loader label="Cargando plantillas…" size={32} />}
          {!pending && templates.length === 0 && (
            <p className="text-body-m text-on-surface-variant">
              No hay plantillas todavía.{" "}
              <Link
                className={buttonClass({ variant: "text", size: "sm" })}
                to="/plantillas"
              >
                Ir a Plantillas
              </Link>
            </p>
          )}
          <ul className="stagger flex flex-col gap-1">
            {templates.map((t, i) => {
              const already = t.exercises.some(
                (x) => x.exerciseId === exercise.id,
              );
              return (
                <li key={t.id} style={{ ["--i" as string]: i }}>
                  <button
                    type="button"
                    disabled={picked !== null || already}
                    onClick={() => void add(t)}
                    onPointerDown={ripple}
                    className="state flex min-h-12 w-full items-center gap-3 rounded-m px-3 py-2 text-left text-body-l transition-colors motion-effects disabled:text-on-surface-variant"
                  >
                    <Monogram name={t.name} size={32} />
                    <span className="min-w-0 flex-1">
                      {picked === t.id ? "Añadiendo…" : t.name}
                      {already ? " · ya está" : ""}
                    </span>
                    {already && <CheckIcon className="shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {done && (
        <Alert tone="info">
          <p className="text-body-m">Añadido al final de «{done}».</p>
        </Alert>
      )}
      {failed && (
        <Alert>
          <p className="text-body-m">{failed}</p>
        </Alert>
      )}
    </Card>
  );
}

// --- Detail page ---------------------------------------------------------------

export function EjercicioDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { exercises, pending, error, reload, updateExercise, deleteExercise } =
    useExercises();
  const templates = useTemplates();

  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const exercise = exercises.find((e) => String(e.id) === id);

  if (error)
    return (
      <Alert>
        <p className="text-body-m">{error}</p>
        <Button variant="outlined" onClick={reload}>
          Reintentar
        </Button>
      </Alert>
    );
  if (pending && exercises.length === 0)
    return <Loader label="Cargando ejercicio…" />;
  if (!exercise)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-headline-l text-e">Este ejercicio no existe.</h1>
        <EmptyState
          title="Puede que se haya borrado o que el enlace esté mal."
          shapes={["soft-diamond", "pill", "clover"]}
        >
          <Link to="/ejercicios" className={buttonClass({ variant: "tonal" })}>
            <BackIcon /> Volver al catálogo
          </Link>
        </EmptyState>
      </div>
    );

  const KindIcon = KIND_ICON[exercise.kind];
  const embedId = exercise.techniqueUrl && ytEmbedId(exercise.techniqueUrl);

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/ejercicios"
        className={buttonClass({ variant: "text", className: "self-start" })}
      >
        <BackIcon /> Volver al catálogo
      </Link>

      <header className="relative flex flex-col gap-5 overflow-hidden rounded-xl rounded-tr-xxl bg-accent-container p-6 text-on-accent-container animate-rise sm:flex-row sm:items-end sm:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-14 -right-12 text-accent opacity-15"
        >
          <Shape name="cookie-12" size={176} />
        </div>
        <div className="relative flex min-w-0 items-center gap-4">
          <Shape name="cookie-9" size={80} className="text-accent">
            <KindIcon width={36} height={36} className="text-on-accent" />
          </Shape>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-label-l">
              {KIND_LABELS[exercise.kind]} · {exercise.tags.length}{" "}
              {exercise.tags.length === 1 ? "grupo" : "grupos"}
            </p>
            <h1 className="text-headline-l text-e break-words">
              {exercise.name}
            </h1>
          </div>
        </div>
        {!editing && (
          <div className="relative flex flex-wrap gap-2">
            <Button variant="tonal" onClick={() => setEditing(true)}>
              <EditIcon width={20} height={20} />
              Editar
            </Button>
            <Button
              variant="outlined"
              className="text-on-accent-container"
              onClick={() => setConfirming(true)}
            >
              <DeleteIcon width={20} height={20} />
              Eliminar
            </Button>
          </div>
        )}
      </header>

      {deleteError && (
        <Alert>
          <p className="text-body-m">{deleteError}</p>
        </Alert>
      )}

      {editing ? (
        <ExerciseEditor
          title="Editar ejercicio"
          initial={toDraft(exercise)}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await updateExercise(exercise.id, input);
            setEditing(false);
          }}
        />
      ) : (
        // Dos columnas en escritorio: el detalle a la izquierda y el dibujo a
        // la derecha, grande para que se lean los grupos musculares. En móvil
        // se apila y el dibujo va primero.
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4 lg:order-2">
            {exercise.regions.length > 0 && (
              <div className="flex items-start justify-center gap-4 rounded-xl bg-surface-container-low p-4">
                <BodyMap
                  view="front"
                  regions={exercise.regions}
                  className="h-72 w-auto max-w-full lg:h-[55vh]"
                />
                <BodyMap
                  view="back"
                  regions={exercise.regions}
                  className="h-72 w-auto max-w-full lg:h-[55vh]"
                />
              </div>
            )}
            <AddToTemplate exercise={exercise} state={templates} />
          </div>

          <Card className="flex flex-col gap-6 rounded-xl">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="section-label">Grupos</span>
                <TagChips tags={exercise.tags} tone="accent" />
              </div>
              {exercise.regions.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="section-label">Músculos</span>
                  <ul className="flex flex-wrap gap-1" aria-label="Músculos">
                    {exercise.regions.map((r) => (
                      <li key={r}>
                        <Badge>{regionLabel(r)}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {exercise.description && (
              <p className="text-body-l">{exercise.description}</p>
            )}
            {exercise.setupCues && (
              <section className="flex flex-col gap-2">
                <h2 className="text-title-m text-e">Preparación</h2>
                <p className="whitespace-pre-line text-body-l">
                  {exercise.setupCues}
                </p>
              </section>
            )}
            {exercise.steps && exercise.steps.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-title-m text-e">Cómo se ejecuta</h2>
                <ol className="stagger flex flex-col gap-3">
                  {exercise.steps.map((step, i) => (
                    <li
                      key={i}
                      style={{ ["--i" as string]: i }}
                      className="flex items-start gap-3"
                    >
                      <Shape
                        name={STEP_SHAPES[i % STEP_SHAPES.length]}
                        size={36}
                        className="text-accent-container"
                      >
                        <span className="tabular text-label-l text-e text-on-accent-container">
                          {i + 1}
                        </span>
                      </Shape>
                      <span className="pt-1.5 text-body-l">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {exercise.techniqueUrl && (
              <section className="flex flex-col gap-3">
                <h2 className="text-title-m text-e">Técnica</h2>
                {embedId && (
                  <div className="overflow-hidden rounded-xl bg-surface-container-highest">
                    <iframe
                      className="block aspect-video w-full"
                      src={`https://www.youtube.com/embed/${embedId}`}
                      title={`Vídeo de técnica de ${exercise.name}`}
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                )}
                <a
                  className={buttonClass({
                    variant: "outlined",
                    className: "self-start",
                  })}
                  href={exercise.techniqueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <PlayIcon width={20} height={20} />
                  Ver técnica
                </a>
              </section>
            )}
          </Card>
        </div>
      )}

      {confirming && (
        <Dialog
          onClose={() => setConfirming(false)}
          labelledBy="ex-delete-title"
          fullscreenOnMobile={false}
          className="max-w-sm gap-4 p-6"
        >
          <Shape
            name="soft-diamond"
            size={56}
            className="self-center text-error-container"
          >
            <DeleteIcon className="text-on-error-container" />
          </Shape>
          <h2 id="ex-delete-title" className="text-center text-headline-s">
            ¿Eliminar {exercise.name}?
          </h2>
          <p className="text-center text-body-m text-on-surface-variant">
            Sale del catálogo y no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="text" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                setDeleteError(null);
                try {
                  await deleteExercise(exercise.id);
                  navigate("/ejercicios");
                } catch (e) {
                  setDeleteError(errorMessage(e));
                  setConfirming(false);
                }
              }}
            >
              Confirmar
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
