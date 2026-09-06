// /ejercicios + /ejercicios/:id — catálogo del banco de ejercicios (E4).
// Diseño D4: "Ver técnica" acepta cualquier URL; los enlaces de YouTube se empotran (E8).
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  useExercises,
  type Exercise,
  type ExerciseInput,
} from "../lib/exercises";
import { apiField } from "../lib/api";
import {
  useTemplates,
  type Template,
  type TemplatesState,
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
      <li key={t} className="badge-done">
        {t}
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
};

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  setupCues: "",
  techniqueUrl: "",
  steps: "",
  tags: [],
});

const toDraft = (x: Exercise): Draft => ({
  name: x.name,
  description: x.description ?? "",
  setupCues: x.setupCues ?? "",
  techniqueUrl: x.techniqueUrl ?? "",
  steps: x.steps?.join("\n") ?? "",
  tags: [...x.tags],
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
  };
};

type FieldErrors = { name?: string; tags?: string; techniqueUrl?: string };

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

  const save = async () => {
    if (submitting) return;
    const errs: FieldErrors = {};
    if (!draft.name.trim()) errs.name = "El nombre es obligatorio";
    if (draft.tags.length < 1) errs.tags = "Al menos un tag es obligatorio";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try {
      await onSubmit(toInput(draft));
    } catch (e) {
      // Envelope-driven (D6): el mensaje del servidor va junto al campo que falló.
      const field = apiField(e);
      setErrors(
        field === "techniqueUrl" || field === "name" || field === "tags"
          ? { [field]: errorMessage(e) }
          : {},
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="ex-name">Nombre</label>
        <input
          id="ex-name"
          className="input"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        {errors.name && (
          <span className="text-sm text-error">{errors.name}</span>
        )}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="ex-desc">Descripción</label>
        <textarea
          id="ex-desc"
          className="input"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="ex-cues">Claves de preparación</label>
        <textarea
          id="ex-cues"
          className="input"
          value={draft.setupCues}
          onChange={(e) => setDraft({ ...draft, setupCues: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="ex-steps">Pasos de ejecución</label>
        <textarea
          id="ex-steps"
          className="input"
          placeholder="Un paso por línea"
          value={draft.steps}
          onChange={(e) => setDraft({ ...draft, steps: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="ex-url">Técnica (URL de YouTube)</label>
        <input
          id="ex-url"
          className="input"
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
          <input
            className="input"
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
          <button
            className="btn-secondary"
            aria-label="Añadir tag"
            onClick={addTag}
          >
            +
          </button>
        </div>
        {draft.tags.map((t) => (
          <button
            key={t}
            className="text-left text-xs text-text-secondary"
            onClick={() =>
              setDraft({ ...draft, tags: draft.tags.filter((x) => x !== t) })
            }
          >
            Quitar tag {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={submitting} onClick={save}>
          {submitting ? "Guardando…" : "Guardar"}
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
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
        <div className="card mb-4 flex items-center justify-between">
          <span className="text-error">{error}</span>
          <button className="btn-secondary" onClick={reload}>
            Reintentar
          </button>
        </div>
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
          <input
            className="input mb-4"
            placeholder="Buscar por nombre o tag"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {pending && exercises.length === 0 && (
            <div className="card">Cargando ejercicios…</div>
          )}
          {!pending && shown.length === 0 && (
            <div className="card mb-4 text-text-secondary">
              Aún no hay ejercicios. Crea tu primer ejercicio.
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((e) => (
              <Link
                key={e.id}
                to={`/ejercicios/${e.id}`}
                className="card flex flex-col gap-2"
              >
                <span className="text-lg font-semibold">{e.name}</span>
                <TagChips tags={e.tags} />
              </Link>
            ))}
          </div>
          <div className="mt-4">
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Nuevo ejercicio
            </button>
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
        rotationIndex: t.rotationIndex,
        exercises: [
          ...t.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            targetSets: e.targetSets,
            targetRepsMin: e.targetRepsMin,
            targetRepsMax: e.targetRepsMax,
          })),
          {
            exerciseId: exercise.id,
            targetSets: null,
            targetRepsMin: null,
            targetRepsMax: null,
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
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>
        Añadir a plantilla
      </button>
      {open && (
        <div className="card flex flex-col gap-2">
          {pending && <span>Cargando plantillas…</span>}
          {!pending && templates.length === 0 && (
            <span>
              No hay plantillas todavía.{" "}
              <Link className="text-primary underline" to="/plan-fuerza">
                Ir a Plan fuerza
              </Link>
            </span>
          )}
          {templates.map((t) => (
            <button
              key={t.id}
              className="btn-secondary text-left"
              disabled={picked !== null}
              onClick={() => void add(t)}
            >
              {picked === t.id ? "Añadiendo…" : t.name}
            </button>
          ))}
        </div>
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
      <div className="card flex items-center justify-between">
        <span className="text-error">{error}</span>
        <button className="btn-secondary" onClick={reload}>
          Reintentar
        </button>
      </div>
    );
  if (pending && exercises.length === 0)
    return <div className="card">Cargando ejercicio…</div>;
  if (!exercise)
    return (
      <div className="card flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Este ejercicio no existe.</h1>
        <Link className="text-primary underline" to="/ejercicios">
          ← Volver al catálogo
        </Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <Link className="text-text-secondary" to="/ejercicios">
        ← Volver
      </Link>
      <div className="card flex flex-col gap-3">
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
            <TagChips tags={exercise.tags} />
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
            className="btn-secondary"
            href={exercise.techniqueUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver técnica
          </a>
        )}
        <AddToTemplate exercise={exercise} state={templates} />
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setEditing(true)}>
            ✏️ Editar
          </button>
          <button className="btn-secondary" onClick={() => setConfirming(true)}>
            Eliminar
          </button>
        </div>
        {confirming && (
          <div className="flex flex-wrap items-center gap-2">
            <span>¿Eliminar {exercise.name}?</span>
            <button
              className="btn-secondary"
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
            <button
              className="btn-primary"
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
            </button>
          </div>
        )}
        {deleteError && <p className="text-sm text-error">{deleteError}</p>}
      </div>
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
