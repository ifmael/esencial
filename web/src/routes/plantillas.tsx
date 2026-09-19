// /plantillas — CRUD de plantillas (agrupaciones semánticas de ejercicios y/o
// cardio, sin rotación). Vivían al pie de /plan-fuerza; ahora tienen su página
// y el planificador solo las usa para expandirlas en un día.
import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  GROUP_LABELS,
  GroupedExercises,
} from "../components/grouped-exercises";
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

// --- Mapa corporal ---------------------------------------------------------

type BodyView = "front" | "back";
type MuscleRegion = { tag: string; label: string; shapes: ReactNode };

const FRONT_REGIONS: MuscleRegion[] = [
  {
    tag: "hombro",
    label: "Hombro",
    shapes: (
      <>
        <ellipse cx="58" cy="60" rx="15" ry="12" />
        <ellipse cx="142" cy="60" rx="15" ry="12" />
      </>
    ),
  },
  {
    tag: "pecho",
    label: "Pecho",
    shapes: <rect x="74" y="58" width="52" height="42" rx="8" />,
  },
  {
    tag: "core",
    label: "Core",
    shapes: <rect x="74" y="104" width="52" height="46" rx="8" />,
  },
  {
    tag: "bíceps",
    label: "Bíceps",
    shapes: (
      <>
        <rect x="40" y="62" width="20" height="36" rx="8" />
        <rect x="140" y="62" width="20" height="36" rx="8" />
      </>
    ),
  },
  {
    tag: "antebrazo",
    label: "Antebrazo",
    shapes: (
      <>
        <rect x="40" y="102" width="20" height="50" rx="8" />
        <rect x="140" y="102" width="20" height="50" rx="8" />
      </>
    ),
  },
  {
    tag: "pierna",
    label: "Pierna",
    shapes: (
      <>
        <rect x="76" y="164" width="20" height="76" rx="8" />
        <rect x="104" y="164" width="20" height="76" rx="8" />
      </>
    ),
  },
  {
    tag: "gemelo",
    label: "Gemelo",
    shapes: (
      <>
        <rect x="76" y="246" width="20" height="62" rx="8" />
        <rect x="104" y="246" width="20" height="62" rx="8" />
      </>
    ),
  },
];

const BACK_REGIONS: MuscleRegion[] = [
  {
    tag: "espalda",
    label: "Espalda",
    shapes: <rect x="74" y="56" width="52" height="86" rx="8" />,
  },
  {
    tag: "hombro",
    label: "Hombro",
    shapes: (
      <>
        <ellipse cx="58" cy="60" rx="15" ry="12" />
        <ellipse cx="142" cy="60" rx="15" ry="12" />
      </>
    ),
  },
  {
    tag: "tríceps",
    label: "Tríceps",
    shapes: (
      <>
        <rect x="40" y="62" width="20" height="36" rx="8" />
        <rect x="140" y="62" width="20" height="36" rx="8" />
      </>
    ),
  },
  {
    tag: "antebrazo",
    label: "Antebrazo",
    shapes: (
      <>
        <rect x="40" y="102" width="20" height="50" rx="8" />
        <rect x="140" y="102" width="20" height="50" rx="8" />
      </>
    ),
  },
  {
    tag: "glúteo",
    label: "Glúteo",
    shapes: (
      <>
        <rect x="76" y="150" width="20" height="30" rx="8" />
        <rect x="104" y="150" width="20" height="30" rx="8" />
      </>
    ),
  },
  {
    tag: "pierna",
    label: "Pierna",
    shapes: (
      <>
        <rect x="76" y="184" width="20" height="60" rx="8" />
        <rect x="104" y="184" width="20" height="60" rx="8" />
      </>
    ),
  },
  {
    tag: "gemelo",
    label: "Gemelo",
    shapes: (
      <>
        <rect x="76" y="246" width="20" height="62" rx="8" />
        <rect x="104" y="246" width="20" height="62" rx="8" />
      </>
    ),
  },
];

function BodySilhouette() {
  return (
    <g
      fill="var(--color-surface-muted)"
      stroke="var(--color-border)"
      strokeWidth="1.5"
    >
      <circle cx="100" cy="22" r="17" />
      <rect x="92" y="39" width="16" height="13" rx="3" />
      <path d="M72 52 L128 52 L132 160 L68 160 Z" />
      <rect x="38" y="56" width="24" height="104" rx="10" />
      <rect x="138" y="56" width="24" height="104" rx="10" />
      <rect x="74" y="160" width="24" height="172" rx="9" />
      <rect x="102" y="160" width="24" height="172" rx="9" />
    </g>
  );
}

function BodyMap({
  view,
  group,
  onSelect,
}: {
  view: BodyView;
  group: string | null;
  onSelect: (tag: string) => void;
}) {
  const regions = view === "front" ? FRONT_REGIONS : BACK_REGIONS;
  return (
    <svg
      viewBox="0 0 200 400"
      className="h-80 w-56"
      aria-label={`Vista ${view === "front" ? "frontal" : "trasera"}`}
    >
      <BodySilhouette />
      {regions.map((r) => (
        <g
          key={r.tag}
          role="button"
          tabIndex={0}
          aria-label={r.label}
          aria-pressed={group === r.tag}
          className="cursor-pointer"
          fill={
            group === r.tag ? "var(--color-primary)" : "var(--color-pending-bg)"
          }
          stroke={
            group === r.tag
              ? "var(--color-primary-dark)"
              : "var(--color-pending)"
          }
          strokeWidth="1.5"
          strokeDasharray={group === r.tag ? undefined : "4 3"}
          onClick={() => onSelect(r.tag)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(r.tag);
            }
          }}
        >
          <title>{r.label}</title>
          {r.shapes}
        </g>
      ))}
    </svg>
  );
}

// --- Añadir ejercicio (modal) ------------------------------------------------

function ExercisePicker({
  exercises,
  draftEntries,
  onAdd,
  onClose,
}: {
  exercises: Exercise[];
  draftEntries: DraftEntry[];
  onAdd: (e: Exercise) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [view, setView] = useState<BodyView>("front");

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = search.trim().toLowerCase();
  const picks = exercises.filter((e) => {
    if (group !== null && !e.tags.includes(group)) return false;
    if (
      q &&
      !(
        e.name.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      )
    )
      return false;
    return true;
  });
  const inDraftIds = new Set(draftEntries.map((en) => en.exerciseId));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <Card
        role="dialog"
        aria-label="Añadir ejercicio"
        className="my-8 flex w-full max-w-xl flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">Añadir ejercicio</h2>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Vista:</span>
          <Button
            variant={view === "front" ? "primary" : "secondary"}
            aria-pressed={view === "front"}
            onClick={() => setView("front")}
          >
            Frontal
          </Button>
          <Button
            variant={view === "back" ? "primary" : "secondary"}
            aria-pressed={view === "back"}
            onClick={() => setView("back")}
          >
            Trasera
          </Button>
        </div>

        <BodyMap
          view={view}
          group={group}
          onSelect={(tag) => setGroup((g) => (g === tag ? null : tag))}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={group == null ? "primary" : "secondary"}
            onClick={() => setGroup(null)}
          >
            Todos
          </Button>
          <span className="text-sm text-text-secondary">
            Grupo: {group ? GROUP_LABELS[group] : "Todos"}
          </span>
        </div>

        <Input
          placeholder="Buscar ejercicio"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {picks.length === 0 ? (
          <p className="text-sm text-text-secondary">Sin ejercicios</p>
        ) : (
          <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto">
            <GroupedExercises
              exercises={picks}
              forceOpen={q !== "" || group !== null}
              listClassName="flex flex-col gap-1"
              renderItem={(e) => (
                <li key={e.id}>
                  <button
                    className="min-h-9 w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-surface-muted disabled:text-text-secondary"
                    disabled={inDraftIds.has(e.id)}
                    onClick={() => {
                      if (inDraftIds.has(e.id)) return;
                      onAdd(e);
                    }}
                  >
                    {e.name}
                    {e.kind === "strength" ? null : ` · ${KIND_LABELS[e.kind]}`}
                  </button>
                </li>
              )}
            />
          </div>
        )}

        <Button variant="secondary" className="self-end" onClick={onClose}>
          Cerrar
        </Button>
      </Card>
    </div>
  );
}

// --- Editor ----------------------------------------------------------------

function TemplateEditor({
  draft: initial,
  submitting,
  onSave,
  onCancel,
}: {
  draft: Draft;
  submitting: boolean;
  onSave: (draft: Draft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
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

  return (
    <Card className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <label htmlFor="tpl-name">Nombre</label>
          <Input
            id="tpl-name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          {nameError && <span className="text-sm text-error">{nameError}</span>}
        </div>
      </header>

      {serverError && <p className="text-sm text-error">{serverError}</p>}

      <ul className="overflow-hidden rounded-lg border border-border bg-surface-muted/50">
        {draft.entries.map((entry, i) => (
          <li
            key={entry.key}
            className={`flex flex-wrap items-center gap-2 bg-surface p-3 ${
              i < draft.entries.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <Link
              className="min-w-32 font-medium text-primary underline-offset-4 hover:underline"
              to={`/ejercicios/${entry.exerciseId}`}
            >
              {entry.exerciseName}
            </Link>
            {entry.kind === "strength" ? (
              <>
                <label className="text-sm">
                  Series
                  <Input
                    className="w-16"
                    type="number"
                    min={1}
                    value={entry.targetSets ?? ""}
                    onChange={(e) =>
                      setDraft(
                        setTargets(draft, entry.key, {
                          targetSets: intAt(e.target.value),
                        }),
                      )
                    }
                  />
                </label>
                <label className="text-sm">
                  Reps mín
                  <Input
                    className="w-16"
                    type="number"
                    min={1}
                    value={entry.targetRepsMin ?? ""}
                    onChange={(e) =>
                      setDraft(
                        setTargets(draft, entry.key, {
                          targetRepsMin: intAt(e.target.value),
                        }),
                      )
                    }
                  />
                </label>
                <label className="text-sm">
                  Reps máx
                  <Input
                    className="w-16"
                    type="number"
                    min={1}
                    value={entry.targetRepsMax ?? ""}
                    onChange={(e) =>
                      setDraft(
                        setTargets(draft, entry.key, {
                          targetRepsMax: intAt(e.target.value),
                        }),
                      )
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <Badge tone="pending">{KIND_LABELS[entry.kind]}</Badge>
                <label className="text-sm">
                  Distancia (km)
                  <Input
                    className="w-20"
                    type="number"
                    min={0}
                    step="0.1"
                    value={entry.targetDistanceKm ?? ""}
                    onChange={(e) =>
                      setDraft(
                        setTargets(draft, entry.key, {
                          targetDistanceKm: numAt(e.target.value),
                        }),
                      )
                    }
                  />
                </label>
                <label className="text-sm">
                  Tiempo (min)
                  <Input
                    className="w-20"
                    type="number"
                    min={0}
                    value={entry.targetDurationMin ?? ""}
                    onChange={(e) =>
                      setDraft(
                        setTargets(draft, entry.key, {
                          targetDurationMin: intAt(e.target.value),
                        }),
                      )
                    }
                  />
                </label>
              </>
            )}
            <Button
              variant="secondary"
              className="min-h-11 min-w-11"
              aria-label="Subir"
              disabled={i === 0}
              onClick={() => setDraft(moveEntry(draft, i, i - 1))}
            >
              ↑
            </Button>
            <Button
              variant="secondary"
              className="min-h-11 min-w-11"
              aria-label="Bajar"
              disabled={i === draft.entries.length - 1}
              onClick={() => setDraft(moveEntry(draft, i, i + 1))}
            >
              ↓
            </Button>
            <Button
              variant="secondary"
              aria-label="Quitar"
              onClick={() => setDraft(removeEntry(draft, entry.key))}
            >
              Quitar
            </Button>
          </li>
        ))}
      </ul>

      <Button
        variant="secondary"
        className="self-start"
        onClick={() => setPickerOpen(true)}
      >
        + Añadir ejercicio
      </Button>

      <div className="flex gap-2">
        <Button disabled={submitting} onClick={save}>
          {submitting ? "Guardando…" : "Guardar"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>

      {pickerOpen && (
        <ExercisePicker
          exercises={exercises}
          draftEntries={draft.entries}
          onAdd={(e) =>
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
            )
          }
          onClose={() => setPickerOpen(false)}
        />
      )}
    </Card>
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
          <span className="truncate text-lg font-semibold">
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
        <ul className="overflow-hidden rounded-lg border border-border bg-surface-muted/50">
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
                    <span className="shrink-0 text-sm text-text-secondary">
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
      {error && <p className="text-sm text-error">{error}</p>}
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
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [editing, setEditing] = useState<{ template: Template | null } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const save = async (draft: Draft) => {
    setSubmitting(true);
    try {
      const payload = buildTemplatePayload(draft);
      const saved = editing?.template
        ? await updateTemplate(editing.template.id, payload)
        : await createTemplate(payload);
      setExpanded((x) => ({ ...x, [saved.id]: true }));
      setEditing(null);
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
      <h1 className="text-2xl font-bold">Plantillas</h1>

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
        {editing && (
          <div className="xl:col-span-2">
            <TemplateEditor
              draft={
                editing.template
                  ? toDraft(editing.template)
                  : { name: "", entries: [] }
              }
              submitting={submitting}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            expanded={Boolean(expanded[t.id])}
            onToggle={() => setExpanded((x) => ({ ...x, [t.id]: !x[t.id] }))}
            onEdit={() => setEditing({ template: t })}
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
        <button
          className="rounded-full bg-primary-container px-6 py-3 font-bold text-on-primary shadow-sm hover:bg-primary-dark"
          onClick={() => setEditing({ template: null })}
        >
          + Nueva plantilla
        </button>
      </div>
    </div>
  );
}
