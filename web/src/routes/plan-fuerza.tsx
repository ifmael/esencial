// /plan-fuerza — rejilla semanal + editor del día. Cada día es una sesión con
// nombre, compuesta de ejercicios copiados desde plantillas (que se expanden y
// desaparecen) y/o sueltos, sin duplicados. Las plantillas de abajo son
// agrupaciones semánticas (CRUD), ya sin rotación.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { WeekGrid } from "../components/week-grid";
import { ApiError, apiField, apiGet, apiSend } from "../lib/api";
import {
  type Exercise,
  type ExerciseKind,
  KIND_LABELS,
  useExercises,
} from "../lib/exercises";
import { currentIsoWeek, shiftIsoWeek } from "../lib/iso-week";
import {
  type SessionDetail,
  type SessionItem,
  type SessionPayload,
  usePlanWeek,
} from "../lib/plan-week";
import {
  addEntry,
  buildTemplatePayload,
  type Draft,
  type DraftEntry,
  moveEntry,
  newEntryKey,
  nextCopyName,
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

const intAt = (raw: string): number | null =>
  raw === "" ? null : Math.max(1, Math.trunc(Number(raw) || 1));

const numAt = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// --- Mapa corporal ---------------------------------------------------------

type BodyView = "front" | "back";
type MuscleRegion = { tag: string; label: string; shapes: ReactNode };

const GROUP_LABELS: Record<string, string> = {
  pecho: "Pecho",
  espalda: "Espalda",
  hombro: "Hombro",
  bíceps: "Bíceps",
  tríceps: "Tríceps",
  pierna: "Pierna",
  glúteo: "Glúteo",
  core: "Core",
  antebrazo: "Antebrazo",
  gemelo: "Gemelo",
};

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
      className="h-48 w-36"
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

// --- Selector de ejercicios (sin diálogo propio) -----------------------------

/** Cotejador alfabético español (acentos y mayúsculas sin peso). */
const collator = new Intl.Collator("es", { sensitivity: "base" });

/** Grupos por primer tag (músculo): grupos y ejercicios en orden alfabético;
 *  los ejercicios sin tag caen en «otro». */
function groupByMuscle(list: Exercise[]): [string, Exercise[]][] {
  const groups: Record<string, Exercise[]> = {};
  for (const e of list) {
    const tag = e.tags[0] ?? "otro";
    groups[tag] ??= [];
    groups[tag].push(e);
  }
  const entries = Object.entries(groups);
  for (const [, items] of entries) {
    items.sort((a, b) => collator.compare(a.name, b.name));
  }
  return entries.sort(([a], [b]) =>
    collator.compare(GROUP_LABELS[a] ?? a, GROUP_LABELS[b] ?? b),
  );
}

/** Grupos plegables: cabecera con nombre y conteo. Cerrados por defecto; si la
 *  lista viene forzada (búsqueda o filtro activos) salen desplegados, y el
 *  usuario puede plegarlos igualmente. */
function GroupedExercises({
  exercises,
  forceOpen,
  listClassName,
  renderItem,
}: {
  exercises: Exercise[];
  forceOpen: boolean;
  listClassName: string;
  renderItem: (e: Exercise) => ReactNode;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <>
      {groupByMuscle(exercises).map(([tag, list]) => {
        const isOpen = forceOpen ? open[tag] !== false : open[tag] === true;
        return (
          <section key={tag} className="flex flex-col gap-1">
            <h3 className="font-semibold uppercase tracking-wide text-text-secondary">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [tag]: !isOpen }))}
              >
                {GROUP_LABELS[tag] ?? tag} ({list.length})
                <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
              </button>
            </h3>
            {isOpen ? (
              <ul className={listClassName}>{list.map(renderItem)}</ul>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

/** Mapa corporal + filtro por grupo + buscador + lista agrupada. Es contenido
 *  puro: la modal de plantilla lo embebe, así nunca hay modal dentro de modal. */
function ExercisePickerBody({
  exercises,
  draftEntries,
  onAdd,
}: {
  exercises: Exercise[];
  draftEntries: DraftEntry[];
  onAdd: (e: Exercise) => void;
}) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [view, setView] = useState<BodyView>("front");

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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-start gap-3">
        <BodyMap
          view={view}
          group={group}
          onSelect={(tag) => setGroup((g) => (g === tag ? null : tag))}
        />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Vista:</span>
            <button
              className={view === "front" ? "btn-primary" : "btn-secondary"}
              aria-pressed={view === "front"}
              onClick={() => setView("front")}
            >
              Frontal
            </button>
            <button
              className={view === "back" ? "btn-primary" : "btn-secondary"}
              aria-pressed={view === "back"}
              onClick={() => setView("back")}
            >
              Trasera
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className={group == null ? "btn-primary" : "btn-secondary"}
              onClick={() => setGroup(null)}
            >
              Todos
            </button>
            <span className="text-sm text-text-secondary">
              Grupo: {group ? GROUP_LABELS[group] : "Todos"}
            </span>
          </div>
        </div>
      </div>

      <input
        className="input shrink-0"
        placeholder="Buscar ejercicio"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {picks.length === 0 ? (
          <p className="text-sm text-text-secondary">Sin ejercicios</p>
        ) : (
          <GroupedExercises
            exercises={picks}
            forceOpen={q !== "" || group !== null}
            listClassName="flex flex-wrap gap-2"
            renderItem={(e) => (
              <li key={e.id}>
                <button
                  className="btn-secondary px-2.5 py-1.5 text-sm"
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
        )}
      </div>
    </div>
  );
}

// --- Modal de plantilla (alta y edición) ------------------------------------

/** Alta/edición de plantilla en UNA sola modal: el selector de ejercicios va
 *  embebido dentro, nunca como modal anidada. Cerrar/Escape descarta. */
function TemplateModal({
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
  const { exercises } = useExercises();

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onCancel();
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-label={title}
        className="card my-8 flex max-h-[85vh] w-full max-w-4xl flex-col gap-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">{title}</h2>

        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="tpl-name">Nombre</label>
          <input
            id="tpl-name"
            autoFocus
            className="input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          {nameError && <span className="text-sm text-error">{nameError}</span>}
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
          <section className="flex min-h-0 flex-col gap-2 md:overflow-hidden">
            <h3 className="font-semibold uppercase tracking-wide text-text-secondary">
              Ejercicios
            </h3>
            <ExercisePickerBody
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
            />
          </section>

          <section className="flex min-h-0 flex-col gap-2 md:overflow-hidden">
            <h3 className="font-semibold uppercase tracking-wide text-text-secondary">
              En la plantilla
            </h3>

            {serverError && <p className="text-sm text-error">{serverError}</p>}

            <ul className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface-muted/50">
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
                        <input
                          className="input w-16"
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
                        <input
                          className="input w-16"
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
                        <input
                          className="input w-16"
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
                      <span className="badge-pending">
                        {KIND_LABELS[entry.kind]}
                      </span>
                      <label className="text-sm">
                        Distancia (km)
                        <input
                          className="input w-20"
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
                        <input
                          className="input w-20"
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
                  <button
                    className="btn-secondary"
                    aria-label="Quitar"
                    onClick={() => setDraft(removeEntry(draft, entry.key))}
                  >
                    Quitar
                  </button>
                </li>
              ))}
              {draft.entries.length === 0 && (
                <li className="bg-surface p-3 text-sm text-text-secondary">
                  Aún no hay ejercicios: añádelos con el selector de la
                  izquierda.
                </li>
              )}
            </ul>
          </section>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border pt-3">
          <button className="btn-primary" disabled={submitting} onClick={save}>
            {submitting ? "Guardando…" : "Guardar"}
          </button>
          <button className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        </div>
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

  const count = template.exercises.length;

  return (
    <section
      ref={register}
      data-expanded={String(expanded)}
      className={`card flex flex-col gap-3 ${expanded ? "xl:col-span-2" : ""}`}
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
          {template.exercises.map((e, i) => (
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
                {e.kind === "strength" ? (
                  e.targetSets != null && (
                    <span className="shrink-0 text-sm text-text-secondary">
                      {e.targetSets} {e.targetSets === 1 ? "serie" : "series"}
                    </span>
                  )
                ) : (
                  <span className="shrink-0 text-sm text-text-secondary">
                    {[
                      e.targetDistanceKm != null
                        ? `${e.targetDistanceKm} km`
                        : null,
                      e.targetDurationMin != null
                        ? `${e.targetDurationMin} min`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || KIND_LABELS[e.kind]}
                  </span>
                )}
              </button>
            </li>
          ))}
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
          <button
            className="btn-secondary"
            onClick={() => setConfirming(false)}
          >
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

// --- Editor del día (sesión) ------------------------------------------------

type DayRow = SessionItem & {
  key: string;
  exerciseId: number;
  exerciseName: string;
  kind: ExerciseKind;
};

function rowsFrom(session: SessionDetail | null): DayRow[] {
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

/** Modal de añadir al día: plantillas (se expanden) y ejercicios sueltos. */
function SessionPicker({
  templates,
  exercises,
  takenIds,
  onPickTemplate,
  onPickExercise,
  onClose,
}: {
  templates: Template[];
  exercises: Exercise[];
  takenIds: Set<number>;
  onPickTemplate: (t: Template) => void;
  onPickExercise: (e: Exercise) => void;
  onClose: () => void;
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Añadir al día"
        className="card flex max-h-[80vh] w-full max-w-md flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">Añadir al día</h2>
        <input
          type="text"
          autoFocus
          placeholder="Buscar plantilla o ejercicio…"
          aria-label="Buscar"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 rounded-lg border border-border px-3"
        />
        <section className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          <h3 className="font-semibold uppercase tracking-wide text-text-secondary">
            Plantillas
          </h3>
          {shownTemplates.length === 0 ? (
            <p className="text-sm text-text-secondary">Sin plantillas</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {shownTemplates.map((t) => (
                <li key={t.id}>
                  <button
                    className="min-h-11 w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-surface-muted"
                    onClick={() => onPickTemplate(t)}
                  >
                    {t.name}
                    <span className="ml-2 text-sm text-text-secondary">
                      {t.exercises.length}{" "}
                      {t.exercises.length === 1 ? "ejercicio" : "ejercicios"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          <h3 className="font-semibold uppercase tracking-wide text-text-secondary">
            Ejercicios
          </h3>
          {shownExercises.length === 0 ? (
            <p className="text-sm text-text-secondary">Sin ejercicios</p>
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
                      className="min-h-11 w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-surface-muted disabled:text-text-secondary"
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
                        <span className="ml-2 text-sm">ya añadido</span>
                      ) : null}
                    </button>
                  </li>
                );
              }}
            />
          )}
        </section>
        <button className="btn-secondary self-end" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

/** Planifica el día: nombre + ejercicios (series/reps o distancia/tiempo). */
function SessionEditor({
  date,
  session,
  templates,
  exercises,
  saving,
  serverError,
  onSave,
  onDelete,
  onCancel,
}: {
  date: string;
  session: SessionDetail | null;
  templates: Template[];
  exercises: Exercise[];
  saving: boolean;
  serverError: string | null;
  onSave: (payload: SessionPayload) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(session?.name ?? "");
  const [rows, setRows] = useState<DayRow[]>(() => rowsFrom(session));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const takenIds = new Set(rows.map((r) => r.exerciseId));

  const patchRow = (key: string, patch: Partial<DayRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const pickTemplate = (t: Template) => {
    const { rows: next, skipped } = expandTemplate(t, rows);
    setRows(next);
    setNote(
      skipped > 0
        ? `${skipped} ${skipped === 1 ? "ejercicio ya estaba" : "ejercicios ya estaban"} en el día`
        : null,
    );
    if (name.trim() === "") setName(t.name);
  };

  const pickExercise = (e: Exercise) => {
    if (takenIds.has(e.id)) return;
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
    <section className="card flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <h2 className="text-lg font-bold">
          {session ? "Editar sesión" : "Nueva sesión"} · {date}
        </h2>
        <div className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <label htmlFor="day-name">Nombre</label>
          <input
            id="day-name"
            className="input"
            placeholder={`Sesión del ${date}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </header>

      {note && <p className="text-sm text-text-secondary">{note}</p>}
      {serverError && <p className="text-sm text-error">{serverError}</p>}

      <ul className="overflow-hidden rounded-lg border border-border bg-surface-muted/50">
        {rows.map((row, i) => (
          <li
            key={row.key}
            className={`flex flex-wrap items-center gap-2 bg-surface p-3 ${
              i < rows.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <span className="min-w-32 font-medium">{row.exerciseName}</span>
            {row.kind === "strength" ? (
              <>
                <label className="text-sm">
                  Series
                  <input
                    className="input w-16"
                    type="number"
                    min={1}
                    aria-label={`${row.exerciseName} series`}
                    value={row.targetSets ?? ""}
                    onChange={(e) =>
                      patchRow(row.key, { targetSets: intAt(e.target.value) })
                    }
                  />
                </label>
                <label className="text-sm">
                  Reps mín
                  <input
                    className="input w-16"
                    type="number"
                    min={1}
                    aria-label={`${row.exerciseName} reps mín`}
                    value={row.targetRepsMin ?? ""}
                    onChange={(e) =>
                      patchRow(row.key, {
                        targetRepsMin: intAt(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  Reps máx
                  <input
                    className="input w-16"
                    type="number"
                    min={1}
                    aria-label={`${row.exerciseName} reps máx`}
                    value={row.targetRepsMax ?? ""}
                    onChange={(e) =>
                      patchRow(row.key, {
                        targetRepsMax: intAt(e.target.value),
                      })
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <span className="badge-pending">{KIND_LABELS[row.kind]}</span>
                <label className="text-sm">
                  Distancia (km)
                  <input
                    className="input w-20"
                    type="number"
                    min={0}
                    step="0.1"
                    aria-label={`${row.exerciseName} distancia (km)`}
                    value={row.targetDistanceKm ?? ""}
                    onChange={(e) =>
                      patchRow(row.key, {
                        targetDistanceKm: numAt(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  Tiempo (min)
                  <input
                    className="input w-20"
                    type="number"
                    min={0}
                    aria-label={`${row.exerciseName} tiempo (min)`}
                    value={row.targetDurationMin ?? ""}
                    onChange={(e) =>
                      patchRow(row.key, {
                        targetDurationMin: intAt(e.target.value),
                      })
                    }
                  />
                </label>
              </>
            )}
            <button
              className="btn-secondary ml-auto"
              aria-label={`Quitar ${row.exerciseName}`}
              onClick={() =>
                setRows((rs) => rs.filter((r) => r.key !== row.key))
              }
            >
              Quitar
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="bg-surface p-3 text-text-secondary">
            Sin ejercicios todavía. Añade una plantilla o ejercicios sueltos.
          </li>
        )}
      </ul>

      <button
        className="btn-secondary self-start"
        onClick={() => setPickerOpen(true)}
      >
        + Añadir
      </button>

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={saving || rows.length === 0}
          onClick={save}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        {session &&
          (confirming ? (
            <span className="flex items-center gap-2">
              <span>¿Eliminar la sesión completa?</span>
              <button className="btn-primary bg-error" onClick={onDelete}>
                Confirmar
              </button>
              <button
                className="btn-secondary"
                onClick={() => setConfirming(false)}
              >
                No
              </button>
            </span>
          ) : (
            <button
              className="btn-secondary"
              onClick={() => setConfirming(true)}
            >
              Eliminar sesión
            </button>
          ))}
      </div>

      {pickerOpen && (
        <SessionPicker
          templates={templates}
          exercises={exercises}
          takenIds={takenIds}
          onPickTemplate={pickTemplate}
          onPickExercise={pickExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}

// --- Page ------------------------------------------------------------------

export function PlanFuerzaPage() {
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
  const [day, setDay] = useState<{
    date: string;
    session: SessionDetail | null;
  } | null>(null);
  const [daySaving, setDaySaving] = useState(false);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const cards = useRef(new Map<number, HTMLElement>());
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
      const detail = await apiGet<SessionDetail>(
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
      <section className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Plan fuerza</h1>
          <Link to="/ejercicios" className="btn-secondary">
            Ejercicios
          </Link>
        </div>
      </section>

      <WeekGrid
        isoWeek={isoWeek}
        sessions={week.sessions}
        loading={week.loading}
        error={week.error}
        onShiftWeek={(d) => gotoWeek(shiftIsoWeek(isoWeek, d))}
        onOpenDay={(date) => void openDay(date)}
        onRemove={(id) => void week.remove(id)}
      />

      {dayLoading && <div className="card mt-4">Cargando sesión…</div>}

      {day && (
        <div className="mt-4">
          <SessionEditor
            key={`${day.date}-${day.session?.id ?? "nueva"}`}
            date={day.date}
            session={day.session}
            templates={templates}
            exercises={exercises}
            saving={daySaving}
            serverError={dayError}
            onSave={(payload) => void saveDay(payload)}
            onDelete={() => void deleteDay()}
            onCancel={() => setDay(null)}
          />
        </div>
      )}

      {dayError && !day && (
        <div className="card mt-4 text-error">{dayError}</div>
      )}

      {error && (
        <div className="card mb-4 flex items-center justify-between">
          <span className="text-error">{error}</span>
          <button className="btn-secondary" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}

      {pending && templates.length === 0 && !error && (
        <div className="card">Cargando plantillas…</div>
      )}

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

      <div className="mt-8 flex justify-center">
        <button
          className="rounded-full bg-primary-container px-6 py-3 font-bold text-on-primary shadow-sm hover:bg-primary-dark"
          onClick={() => setEditing({ template: null })}
        >
          + Nueva plantilla
        </button>
      </div>

      {editing && (
        <TemplateModal
          title={editing.template ? "Editar plantilla" : "Nueva plantilla"}
          draft={
            editing.template
              ? toDraft(editing.template)
              : { name: "", entries: [] }
          }
          submitting={submitting}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
