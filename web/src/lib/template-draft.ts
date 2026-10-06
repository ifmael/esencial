// Lógica pura del editor de plantillas (E4 design D2): el editor muta un
// borrador local; guardar envía un único payload con posiciones 0..n-1.
// Una entrada es de fuerza (series/reps) o de cardio (distancia/tiempo).
import type { ExerciseKind } from "./exercises";

export type DraftEntry = {
  key: string; // stable React row key (never the position)
  exerciseId: number;
  exerciseName: string;
  kind: ExerciseKind;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDistanceKm: number | null;
  targetDurationMin: number | null;
  /** Descansos programados (segundos): entre series y al terminar el ejercicio. */
  restSecs: number | null;
  restAfterSecs: number | null;
  /** `true` = va pegado a la entrada siguiente (bloque/superserie). */
  superset: boolean;
};

export type Draft = {
  name: string;
  entries: DraftEntry[];
};

export type Targets = Pick<
  DraftEntry,
  | "targetSets"
  | "targetRepsMin"
  | "targetRepsMax"
  | "targetDistanceKm"
  | "targetDurationMin"
  | "restSecs"
  | "restAfterSecs"
  | "superset"
>;

let keySeq = 0;
export const newEntryKey = (): string => `d${++keySeq}`;

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  )
    return [...list];
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

export const addEntry = (draft: Draft, entry: DraftEntry): Draft => ({
  ...draft,
  entries: [...draft.entries, { ...entry, key: newEntryKey() }],
});

export const removeEntry = (draft: Draft, key: string): Draft => ({
  ...draft,
  entries: draft.entries.filter((e) => e.key !== key),
});

export const setTargets = (
  draft: Draft,
  key: string,
  targets: Partial<Targets>,
): Draft => ({
  ...draft,
  entries: draft.entries.map((e) => (e.key === key ? { ...e, ...targets } : e)),
});

export const moveEntry = (draft: Draft, from: number, to: number): Draft => ({
  ...draft,
  entries: moveItem(draft.entries, from, to),
});

// --- Wire payload (templateSchema: api/src/api-validation.ts) ---------------

export type TemplateEntryPayload = {
  exerciseId: number;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDistanceKm: number | null;
  targetDurationMin: number | null;
  restSecs: number | null;
  restAfterSecs: number | null;
  superset: boolean;
};

export type TemplatePayload = {
  name: string;
  exercises: TemplateEntryPayload[];
};

export function buildTemplatePayload(draft: Draft): TemplatePayload {
  return {
    name: draft.name,
    exercises: draft.entries.map((e) => ({
      exerciseId: e.exerciseId,
      targetSets: e.targetSets,
      targetRepsMin: e.targetRepsMin,
      targetRepsMax: e.targetRepsMax,
      targetDistanceKm: e.targetDistanceKm,
      targetDurationMin: e.targetDurationMin,
      restSecs: e.restSecs,
      restAfterSecs: e.restAfterSecs,
      superset: e.superset,
    })),
  };
}

// --- Entradas numéricas de los editores (plantilla y día) -------------------

/** "" → null; cualquier otro valor → entero ≥ 1 (nunca NaN). */
export const intAt = (raw: string): number | null =>
  raw === "" ? null : Math.max(1, Math.trunc(Number(raw) || 1));

/** Descanso en segundos: "" → null; el resto se recorta a 1..3600 (el espejo
 *  del rango que valida la API). */
export const restAt = (raw: string): number | null =>
  raw === "" ? null : Math.min(3600, Math.max(1, Math.trunc(Number(raw) || 1)));

/** Descanso por defecto de los editores (segundos): los campos nacen con este
 *  valor (y se guarda tal cual); vaciarlos deja el ejercicio sin descanso. */
export const DEFAULT_REST_SECS = 120;

/** "" o valores no finitos/negativos → null; el resto, número tal cual. */
export function numAt(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** "Tirón" → "Tirón (copia)", then "(copia 2)", "(copia 3)"… */
export function nextCopyName(
  source: string,
  existing: readonly string[],
): string {
  const base = `${source} (copia)`;
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${source} (copia ${n})`)) n++;
  return `${source} (copia ${n})`;
}
