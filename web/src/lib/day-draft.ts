// Autoguardado del borrador del día en `localStorage`: un refresco accidental
// (o cerrar la pestaña) no debe perder lo ya registrado. Solo viajan las marcas
// (series y cardio), el esfuerzo y la nota; la lista de ejercicios manda desde
// el plan. Son piezas puras salvo el almacén, que falla en silencio si el
// navegador lo tiene bloqueado.

export type DraftSetSnapshot = {
  weightKg: number | null;
  reps: number | null;
  done: boolean;
  touched: boolean;
};

export type DraftExerciseSnapshot = {
  /** `plan_session_exercises.id`: es lo que ata lo guardado al plan. */
  id: number;
  noWeight: boolean;
  sets: DraftSetSnapshot[];
};

export type DraftCardioSnapshot = {
  id: number;
  distanceKm: number | null;
  durationMin: number | null;
  done: boolean;
};

export type DraftSnapshot = {
  version: 1;
  exercises: DraftExerciseSnapshot[];
  cardio: DraftCardioSnapshot[];
  effort: number | null;
  note: string;
};

/** Mínimo que necesita el borrador para serializarse (el resto se descarta). */
type SnapshotSource<T> = {
  se: { id: number };
} & T;

export function snapshotOf(
  exercises: readonly SnapshotSource<{
    noWeight: boolean;
    sets: readonly DraftSetSnapshot[];
  }>[],
  cardio: readonly SnapshotSource<{
    distanceKm: number | null;
    durationMin: number | null;
    done: boolean;
  }>[],
  effort: number | null,
  note: string,
): DraftSnapshot {
  return {
    version: 1,
    exercises: exercises.map((ex) => ({
      id: ex.se.id,
      noWeight: ex.noWeight,
      sets: ex.sets.map((s) => ({ ...s })),
    })),
    cardio: cardio.map((c) => ({
      id: c.se.id,
      distanceKm: c.distanceKm,
      durationMin: c.durationMin,
      done: c.done,
    })),
    effort,
    note,
  };
}

function isNullOrNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function isSetSnapshot(value: unknown): value is DraftSetSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    isNullOrNumber(s.weightKg) &&
    isNullOrNumber(s.reps) &&
    typeof s.done === "boolean" &&
    typeof s.touched === "boolean"
  );
}

function isExerciseSnapshot(value: unknown): value is DraftExerciseSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "number" &&
    typeof e.noWeight === "boolean" &&
    Array.isArray(e.sets) &&
    e.sets.every(isSetSnapshot)
  );
}

function isCardioSnapshot(value: unknown): value is DraftCardioSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "number" &&
    isNullOrNumber(c.distanceKm) &&
    isNullOrNumber(c.durationMin) &&
    typeof c.done === "boolean"
  );
}

/** Valida lo guardado: lo de otra versión (o de otra app) no se interpreta. */
export function parseSnapshot(raw: string | null): DraftSnapshot | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const s = value as Record<string, unknown>;
  if (s.version !== 1) return null;
  if (!Array.isArray(s.exercises) || !s.exercises.every(isExerciseSnapshot))
    return null;
  if (!Array.isArray(s.cardio) || !s.cardio.every(isCardioSnapshot))
    return null;
  if (!isNullOrNumber(s.effort)) return null;
  if (typeof s.note !== "string") return null;
  return {
    version: 1,
    exercises: s.exercises,
    cardio: s.cardio,
    effort: s.effort,
    note: s.note,
  };
}

/** Clave por fecha: un día, un borrador (la sesión del día es única). */
export const draftKey = (date: string) => `esencial.borrador.${date}`;

export function readDraft(date: string): DraftSnapshot | null {
  try {
    return parseSnapshot(window.localStorage.getItem(draftKey(date)));
  } catch {
    return null;
  }
}

export function writeDraft(date: string, snapshot: DraftSnapshot): void {
  try {
    window.localStorage.setItem(draftKey(date), JSON.stringify(snapshot));
  } catch {
    // Almacenamiento bloqueado o lleno: se sigue sin autoguardado.
  }
}

export function clearDraft(date: string): void {
  try {
    window.localStorage.removeItem(draftKey(date));
  } catch {
    // Idem.
  }
}

/** Aplica lo guardado a las series de fuerza: solo donde el plan sigue
 *  encajando (mismo id y mismo número de series). El plan manda. */
export function restoreExercises<
  T extends {
    se: { id: number };
    noWeight: boolean;
    sets: DraftSetSnapshot[];
  },
>(current: T[], stored: readonly DraftExerciseSnapshot[] | undefined): T[] {
  if (!stored) return current;
  return current.map((ex) => {
    const saved = stored.find((s) => s.id === ex.se.id);
    if (!saved || saved.sets.length !== ex.sets.length) return ex;
    return {
      ...ex,
      noWeight: saved.noWeight,
      sets: saved.sets.map((s) => ({ ...s })),
    };
  });
}

/** Aplica lo guardado al cardio, por ejercicio del plan (aquí no hay series). */
export function restoreCardio<
  T extends {
    se: { id: number };
    distanceKm: number | null;
    durationMin: number | null;
    done: boolean;
  },
>(current: T[], stored: readonly DraftCardioSnapshot[] | undefined): T[] {
  if (!stored) return current;
  return current.map((c) => {
    const saved = stored.find((s) => s.id === c.se.id);
    return saved
      ? {
          ...c,
          distanceKm: saved.distanceKm,
          durationMin: saved.durationMin,
          done: saved.done,
        }
      : c;
  });
}
