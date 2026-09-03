// /plan-fuerza — plantillas rotatorias expandibles + editor de borrador local.
// Diseño E4: D2 (un PUT atómico), D3 (↑/↓ sin drag), D5 (chips = orden API).
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTemplates, type Template } from "../lib/templates";
import { useExercises } from "../lib/exercises";
import { apiField } from "../lib/api";
import {
  addEntry,
  buildTemplatePayload,
  moveEntry,
  newEntryKey,
  nextCopyName,
  removeEntry,
  setTargets,
  type Draft,
} from "../lib/template-draft";

function formatTarget(e: {
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
}): string | null {
  if (e.targetSets == null) return null; // objetivos parciales/ausentes → solo nombre
  const { targetRepsMin: min, targetRepsMax: max } = e;
  const reps = min != null && max != null && min !== max ? `${min}–${max}` : (min ?? max);
  return reps == null ? `${e.targetSets}×` : `${e.targetSets}×${reps}`;
}

const toDraft = (t: Template): Draft => ({
  name: t.name,
  rotationIndex: t.rotationIndex,
  entries: t.exercises.map((e) => ({
    key: `s${e.id}`,
    exerciseId: e.exerciseId,
    exerciseName: e.exerciseName,
    targetSets: e.targetSets,
    targetRepsMin: e.targetRepsMin,
    targetRepsMax: e.targetRepsMax,
  })),
});

const intAt = (raw: string): number | null =>
  raw === "" ? null : Math.max(1, Math.trunc(Number(raw) || 1));

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
  const [search, setSearch] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const { exercises } = useExercises();

  const q = search.trim().toLowerCase();
  const picks = q
    ? exercises.filter(
        (e) => e.name.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)),
      )
    : exercises;

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
    <div className="card mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="tpl-name">Nombre</label>
          <input
            id="tpl-name"
            className="input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          {nameError && <span className="text-sm text-error">{nameError}</span>}
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="tpl-rot">Rotación</label>
          <input
            id="tpl-rot"
            className="input w-20"
            type="number"
            min={0}
            value={draft.rotationIndex}
            onChange={(e) =>
              setDraft({ ...draft, rotationIndex: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
            }
          />
        </div>
      </div>

      {serverError && <p className="text-sm text-error">{serverError}</p>}

      <ul className="flex flex-col gap-2">
        {draft.entries.map((entry, i) => (
          <li key={entry.key} className="flex flex-wrap items-end gap-2">
            <span className="min-w-32 pb-2 font-medium">{entry.exerciseName}</span>
            <label className="text-sm">
              Series
              <input
                className="input w-16"
                type="number"
                min={1}
                value={entry.targetSets ?? ""}
                onChange={(e) =>
                  setDraft(setTargets(draft, entry.key, { ...entry, targetSets: intAt(e.target.value) }))
                }
              />
            </label>
            <label className="text-sm">
              Reps mín
              <input
                className="input w-16"
                type="number"
                min={1}
                value={entry.targetRepsMin ?? ""}
                onChange={(e) =>
                  setDraft(setTargets(draft, entry.key, { ...entry, targetRepsMin: intAt(e.target.value) }))
                }
              />
            </label>
            <label className="text-sm">
              Reps máx
              <input
                className="input w-16"
                type="number"
                min={1}
                value={entry.targetRepsMax ?? ""}
                onChange={(e) =>
                  setDraft(setTargets(draft, entry.key, { ...entry, targetRepsMax: intAt(e.target.value) }))
                }
              />
            </label>
            <button
              className="btn-secondary min-h-11 min-w-11"
              aria-label="Subir"
              disabled={i === 0}
              onClick={() => setDraft(moveEntry(draft, i, i - 1))}
            >
              ↑
            </button>
            <button
              className="btn-secondary min-h-11 min-w-11"
              aria-label="Bajar"
              disabled={i === draft.entries.length - 1}
              onClick={() => setDraft(moveEntry(draft, i, i + 1))}
            >
              ↓
            </button>
            <button className="btn-secondary" aria-label="Quitar" onClick={() => setDraft(removeEntry(draft, entry.key))}>
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <div>
        <input
          className="input"
          placeholder="Buscar ejercicio"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="mt-2 flex flex-wrap gap-2">
          {picks.map((e) => (
            <li key={e.id}>
              <button
                className="btn-secondary"
                onClick={() =>
                  setDraft(
                    addEntry(draft, {
                      key: newEntryKey(),
                      exerciseId: e.id,
                      exerciseName: e.name,
                      targetSets: null,
                      targetRepsMin: null,
                      targetRepsMax: null,
                    }),
                  )
                }
              >
                {e.name}
              </button>
            </li>
          ))}
        </ul>
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

// --- Card ------------------------------------------------------------------

function TemplateCard({
  template,
  expanded,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  register,
}: {
  template: Template;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => Promise<string | null>;
  register: (el: HTMLElement | null) => void;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section ref={register} data-expanded={String(expanded)} className="card flex flex-col gap-2">
      <button className="flex items-center justify-between text-left text-lg font-semibold" onClick={onToggle}>
        <span>{template.name}</span>
        <span aria-hidden>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <ul className="flex flex-col gap-1">
          {template.exercises.map((e) => {
            const target = formatTarget(e);
            return (
              <li key={e.id}>
                <button className="min-h-11 text-left" onClick={() => navigate(`/ejercicios/${e.exerciseId}`)}>
                  {e.exerciseName}
                  {target && <span className="ml-2 text-text-secondary">{target}</span>}
                </button>
              </li>
            );
          })}
          {template.exercises.length === 0 && <li className="text-text-secondary">Sin ejercicios todavía.</li>}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={onEdit}>
          Editar
        </button>
        <button className="btn-secondary" onClick={onDuplicate}>
          Duplicar
        </button>
        <button className="btn-secondary" onClick={() => setConfirming(true)}>
          Eliminar
        </button>
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center gap-2">
          <span>¿Eliminar {template.name}?</span>
          <button className="btn-secondary" onClick={() => setConfirming(false)}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={async () => {
              const msg = await onDelete();
              if (msg) {
                setError(msg);
                setConfirming(false);
              }
            }}
          >
            Confirmar
          </button>
        </div>
      )}
      {error && <p className="text-sm text-error">{error}</p>}
    </section>
  );
}

// --- Page ------------------------------------------------------------------

export function PlanFuerzaPage() {
  const { templates, pending, error, reload, createTemplate, updateTemplate, deleteTemplate } = useTemplates();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [editing, setEditing] = useState<{ template: Template | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const cards = useRef(new Map<number, HTMLElement>());

  const goTo = (t: Template) => {
    setExpanded((x) => ({ ...x, [t.id]: true }));
    cards.current.get(t.id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

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
    <div>
      <h1 className="mb-4 text-2xl font-bold">Plan fuerza</h1>

      {templates.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {templates.map((t) => (
            <button key={t.id} className="badge-pending min-h-11" aria-label={t.name} onClick={() => goTo(t)}>
              {t.name.split("—")[0].trim() || String(t.rotationIndex + 1)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="card mb-4 flex items-center justify-between">
          <span className="text-error">{error}</span>
          <button className="btn-secondary" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}

      {editing && (
        <TemplateEditor
          draft={editing.template ? toDraft(editing.template) : { name: "", rotationIndex: 0, entries: [] }}
          submitting={submitting}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {pending && templates.length === 0 && !error && <div className="card">Cargando plantillas…</div>}

      {!pending && templates.length === 0 && !error && (
        <div className="card mb-4 text-text-secondary">
          Aún no hay plantillas. Crea tu primera plantilla de sesión.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            expanded={Boolean(expanded[t.id])}
            register={(el) => {
              if (el) cards.current.set(t.id, el);
              else cards.current.delete(t.id);
            }}
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

      <div className="mt-4">
        <button className="btn-primary" onClick={() => setEditing({ template: null })}>
          + Nueva plantilla
        </button>
      </div>
    </div>
  );
}
