// Pure template-editor draft logic (E4 design D2): the editor mutates a local
// draft; save flushes exactly one payload with positions renumbered 0..n-1.

export type DraftEntry = {
  key: string; // stable React row key (never the position)
  exerciseId: number;
  exerciseName: string;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
};

export type Draft = {
  name: string;
  rotationIndex: number;
  entries: DraftEntry[];
};

export type Targets = Pick<DraftEntry, "targetSets" | "targetRepsMin" | "targetRepsMax">;

let keySeq = 0;
export const newEntryKey = (): string => `d${++keySeq}`;

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length)
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

export const setTargets = (draft: Draft, key: string, targets: Targets): Draft => ({
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
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
};

export type TemplatePayload = {
  name: string;
  // Optional like the server schema: absent = preserve stored rotation (COALESCE).
  rotation_index?: number;
  exercises: TemplateEntryPayload[];
};

export function buildTemplatePayload(draft: Draft): TemplatePayload {
  return {
    name: draft.name,
    rotation_index: draft.rotationIndex,
    exercises: draft.entries.map((e) => ({
      exerciseId: e.exerciseId,
      target_sets: e.targetSets,
      target_reps_min: e.targetRepsMin,
      target_reps_max: e.targetRepsMax,
    })),
  };
}

/** "B — Tirón" → "B — Tirón (copia)", then "(copia 2)", "(copia 3)"… */
export function nextCopyName(source: string, existing: readonly string[]): string {
  const base = `${source} (copia)`;
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${source} (copia ${n})`)) n++;
  return `${source} (copia ${n})`;
}
