// /ejercicios + /ejercicios/:id — catálogo del banco de ejercicios (E4).
// Diseño D4: "Ver técnica" acepta cualquier URL; los enlaces de YouTube se empotran (E8).
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  type MuscleRegion,
  regionLabel,
  regionsOfGroup,
} from "../components/body-map/regions";
import { GROUP_LABELS } from "../components/grouped-exercises";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  cardClass,
  Input,
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

const TagChips = ({ tags }: { tags: string[] }) => (
  <ul className="flex flex-wrap gap-1" aria-label="tags">
    {tags.map((t) => (
      <li key={t}>
        <Badge tone="done">{t}</Badge>
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
  initial,
  onSubmit,
  onCancel,
}: {
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

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="ex-name">Nombre</label>
        <Input
          id="ex-name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        {errors.name && (
          <span className="text-sm text-error">{errors.name}</span>
        )}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="ex-kind">Tipo</label>
        <Select
          id="ex-kind"
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
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="ex-desc">Descripción</label>
        <Textarea
          id="ex-desc"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="ex-cues">Claves de preparación</label>
        <Textarea
          id="ex-cues"
          value={draft.setupCues}
          onChange={(e) => setDraft({ ...draft, setupCues: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="ex-steps">Pasos de ejecución</label>
        <Textarea
          id="ex-steps"
          placeholder="Un paso por línea"
          value={draft.steps}
          onChange={(e) => setDraft({ ...draft, steps: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="ex-url">Técnica (URL de YouTube)</label>
        <Input
          id="ex-url"
          placeholder="Pega una URL (YouTube u otra)"
          value={draft.techniqueUrl}
          onChange={(e) => setDraft({ ...draft, techniqueUrl: e.target.value })}
        />
        {errors.techniqueUrl && (
          <span className="text-sm text-error">{errors.techniqueUrl}</span>
        )}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <span id="ex-tags-label">Tags</span>
        {errors.tags && (
          <span className="text-sm text-error">{errors.tags}</span>
        )}
        <TagChips tags={draft.tags} />
        <div className="flex gap-2">
          <Input
            placeholder="Añadir tag"
            aria-labelledby="ex-tags-label"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button variant="secondary" aria-label="Añadir tag" onClick={addTag}>
            +
          </Button>
        </div>
        {draft.tags.map((t) => (
          <button
            key={t}
            className="text-left text-xs text-text-secondary"
            onClick={() => removeTag(t)}
          >
            Quitar tag {t}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <span id="ex-regions-label">Músculos</span>
        {errors.regions && (
          <span className="text-sm text-error">{errors.regions}</span>
        )}
        {draft.tags.every((t) => regionsOfGroup(t).length === 0) ? (
          <span className="text-text-secondary">
            Añade arriba un grupo muscular para elegir sus músculos.
          </span>
        ) : (
          draft.tags.map((t) => {
            const options = regionsOfGroup(t);
            if (options.length === 0) return null;
            return (
              <div key={t} className="flex flex-wrap items-center gap-1">
                <span className="text-text-secondary">
                  {GROUP_LABELS[t] ?? t}:
                </span>
                {options.map((r) => (
                  <Button
                    key={r.id}
                    size="sm"
                    variant={
                      draft.regions.includes(r.id) ? "primary" : "secondary"
                    }
                    aria-pressed={draft.regions.includes(r.id)}
                    onClick={() => toggleRegion(r)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            );
          })
        )}
      </div>
      <div className="flex gap-2">
        <Button disabled={submitting} onClick={save}>
          {submitting ? "Guardando…" : "Guardar"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
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
  const [creating, setCreating] = useState(false);

  const q = search.trim().toLowerCase();
  const shown = q
    ? exercises.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      )
    : exercises;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Ejercicios</h1>
      {error && (
        <Card className="mb-4 flex items-center justify-between">
          <span className="text-error">{error}</span>
          <Button variant="secondary" onClick={reload}>
            Reintentar
          </Button>
        </Card>
      )}
      {creating ? (
        <ExerciseEditor
          initial={emptyDraft()}
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            const created = await createExercise(input);
            navigate(`/ejercicios/${created.id}`);
          }}
        />
      ) : (
        <>
          <Input
            className="mb-4"
            placeholder="Buscar por nombre o tag"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {pending && exercises.length === 0 && (
            <Card>Cargando ejercicios…</Card>
          )}
          {!pending && shown.length === 0 && (
            <Card className="mb-4 text-text-secondary">
              Aún no hay ejercicios. Crea tu primer ejercicio.
            </Card>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((e) => (
              <Link
                key={e.id}
                to={`/ejercicios/${e.id}`}
                className={cardClass("flex flex-col gap-2")}
              >
                <span className="text-lg font-semibold">{e.name}</span>
                {e.kind === "strength" ? null : (
                  <Badge tone="pending" className="self-start">
                    {KIND_LABELS[e.kind]}
                  </Badge>
                )}
                <TagChips tags={e.tags} />
              </Link>
            ))}
          </div>
          <div className="mt-4">
            <Button onClick={() => setCreating(true)}>+ Nuevo ejercicio</Button>
          </div>
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
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const add = async (t: Template) => {
    if (picked !== null) return;
    setPicked(t.id);
    setFailed(null);
    setDone(false);
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
      setDone(true);
    } catch (e) {
      setFailed(errorMessage(e));
    } finally {
      setPicked(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => setOpen((o) => !o)}>Añadir a plantilla</Button>
      {open && (
        <Card className="flex flex-col gap-2">
          {pending && <span>Cargando plantillas…</span>}
          {!pending && templates.length === 0 && (
            <span>
              No hay plantillas todavía.{" "}
              <Link className="text-primary underline" to="/plantillas">
                Ir a Plantillas
              </Link>
            </span>
          )}
          {templates.map((t) => {
            const already = t.exercises.some(
              (x) => x.exerciseId === exercise.id,
            );
            return (
              <Button
                key={t.id}
                variant="secondary"
                className="text-left"
                disabled={picked !== null || already}
                onClick={() => void add(t)}
              >
                {picked === t.id ? "Añadiendo…" : t.name}
                {already ? " · ya está" : ""}
              </Button>
            );
          })}
        </Card>
      )}
      {done && (
        <p className="text-sm text-primary">
          Añadido al final de la plantilla.
        </p>
      )}
      {failed && <p className="text-sm text-error">{failed}</p>}
    </div>
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
      <Card className="flex items-center justify-between">
        <span className="text-error">{error}</span>
        <Button variant="secondary" onClick={reload}>
          Reintentar
        </Button>
      </Card>
    );
  if (pending && exercises.length === 0)
    return <Card>Cargando ejercicio…</Card>;
  if (!exercise)
    return (
      <Card className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Este ejercicio no existe.</h1>
        <Link className="text-primary underline" to="/ejercicios">
          ← Volver al catálogo
        </Link>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <Link className="text-text-secondary" to="/ejercicios">
        ← Volver
      </Link>
      <Card className="flex flex-col gap-3">
        <div className="flex items-start gap-4">
          {/* Placeholder de foto: la tabla exercises no tiene columna de imagen (E4). */}
          <div
            aria-hidden
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-3xl"
          >
            🏋️
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">{exercise.name}</h1>
            <div className="flex flex-col gap-1">
              <span className="section-label">Grupos</span>
              <TagChips tags={exercise.tags} />
            </div>
            {exercise.regions.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="section-label">Músculos</span>
                <ul className="flex flex-wrap gap-1" aria-label="músculos">
                  {exercise.regions.map((id) => (
                    <li key={id}>
                      <Badge tone="pending">{regionLabel(id)}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        {exercise.description && <p>{exercise.description}</p>}
        {exercise.setupCues && (
          <div>
            <h2 className="mb-1 font-semibold">Preparación</h2>
            <p className="whitespace-pre-line">{exercise.setupCues}</p>
          </div>
        )}
        {exercise.steps && exercise.steps.length > 0 && (
          <div>
            <h2 className="mb-1 font-semibold">Cómo se ejecuta</h2>
            <ol className="list-decimal space-y-1 pl-5">
              {exercise.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}
        {exercise.techniqueUrl && ytEmbedId(exercise.techniqueUrl) && (
          <iframe
            className="aspect-video w-full rounded-xl"
            src={`https://www.youtube.com/embed/${ytEmbedId(exercise.techniqueUrl)}`}
            title={`Vídeo de técnica de ${exercise.name}`}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        )}
        {exercise.techniqueUrl && (
          <a
            className={buttonClass({ variant: "secondary" })}
            href={exercise.techniqueUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver técnica
          </a>
        )}
        <AddToTemplate exercise={exercise} state={templates} />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            ✏️ Editar
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Eliminar
          </Button>
        </div>
        {confirming && (
          <div className="flex flex-wrap items-center gap-2">
            <span>¿Eliminar {exercise.name}?</span>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
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
        )}
        {deleteError && <p className="text-sm text-error">{deleteError}</p>}
      </Card>
      {editing && (
        <ExerciseEditor
          initial={toDraft(exercise)}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await updateExercise(exercise.id, input);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
