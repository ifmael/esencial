// useExercises hook (E4, E2 useRecipes pattern): full list + mutate + refetch.
// kind: fuerza (series/reps) o cardio (distancia/tiempo).
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiGetCached } from "./api";
import { fold } from "./text";

export type ExerciseKind = "strength" | "running" | "bike";

export const KIND_LABELS: Record<ExerciseKind, string> = {
  strength: "Fuerza",
  running: "Running",
  bike: "Bici",
};

/** Unidad de la serie de un ejercicio de fuerza (espejo de `METRICS` en la API;
 *  lo ata `tests/muscle-regions.test.ts`). El cardio usa distancia/tiempo. */
export type ExerciseMetric = "weight_reps" | "reps" | "time" | "weight_time";

export const METRIC_LABELS: Record<ExerciseMetric, string> = {
  weight_reps: "Peso × reps",
  reps: "Reps",
  time: "Segundos",
  weight_time: "Peso × segundos",
};

/** Orden de la escala, para el grupo conectado del editor. */
export const METRIC_ORDER: ExerciseMetric[] = [
  "weight_reps",
  "reps",
  "time",
  "weight_time",
];

/** Grado de implicación de un músculo, de más a menos (espejo de
 *  `REGION_ROLES` en la API; `tests/muscle-regions.test.ts` los ata). */
export type RegionRole = "primary" | "secondary" | "stabilizer";

export const ROLE_LABELS: Record<RegionRole, string> = {
  primary: "Principal",
  secondary: "Secundario",
  stabilizer: "Estabilizador",
};

/** Un músculo que trabaja el ejercicio y cuánto. */
export type ExerciseRegion = { region: string; role: RegionRole };

/** Info compacta del objetivo de un ejercicio (formato único de la app):
 *  fuerza → «3 series» (null si no hay series); cardio → «10 km · 45 min». */
export function targetSummary(e: {
  kind: ExerciseKind;
  targetSets: number | null;
  targetDistanceKm: number | null;
  targetDurationMin: number | null;
}): string | null {
  if (e.kind === "strength") {
    return e.targetSets == null
      ? null
      : `${e.targetSets} ${e.targetSets === 1 ? "serie" : "series"}`;
  }
  return (
    [
      e.targetDistanceKm != null ? `${e.targetDistanceKm} km` : null,
      e.targetDurationMin != null ? `${e.targetDurationMin} min` : null,
    ]
      .filter(Boolean)
      .join(" · ") || KIND_LABELS[e.kind]
  );
}

export type Exercise = {
  id: number;
  name: string;
  description: string | null;
  setupCues: string | null;
  techniqueUrl: string | null;
  steps: string[] | null;
  tags: string[];
  /** Nombre inglés y sinónimos de búsqueda, en minúsculas (0022). */
  aliases: string[];
  /** Sub-regiones del mapa anatómico (`web/src/components/body-map/regions`)
   *  con su grado, ordenadas por región. */
  regions: ExerciseRegion[];
  kind: ExerciseKind;
  /** Unidad de la serie (solo fuerza): kg×reps, reps, segundos o kg+segundos. */
  metric: ExerciseMetric;
};

export type ExerciseInput = {
  name: string;
  description?: string | null;
  setupCues?: string | null;
  techniqueUrl?: string | null;
  steps?: string[] | null;
  tags: string[];
  aliases: string[];
  regions?: ExerciseRegion[];
  /** Ausente = el servidor aplica "strength". */
  kind?: ExerciseKind;
  /** Ausente = el servidor aplica "weight_reps". */
  metric?: ExerciseMetric;
};

/** Textos por los que se busca un ejercicio: nombre canónico, alias y grupos.
 *  La paleta ⌘K los usa como `keywords` (su ranking es difuso). */
export function exerciseSearchTerms(
  e: Pick<Exercise, "name" | "aliases" | "tags">,
): string[] {
  return [e.name, ...e.aliases, ...e.tags];
}

/** ¿Casa la consulta con el nombre, los alias o los grupos del ejercicio?
 *  `extra` añade textos de la superficie (p. ej. la etiqueta de la sub-región).
 *  La consulta vacía casa todo. */
export function matchesExercise(
  e: Pick<Exercise, "name" | "aliases" | "tags">,
  q: string,
  extra: readonly string[] = [],
): boolean {
  const needle = fold(q.trim());
  if (!needle) return true;
  return [...exerciseSearchTerms(e), ...extra].some((t) =>
    fold(t).includes(needle),
  );
}

export type ExercisesState = {
  exercises: Exercise[];
  pending: boolean;
  error: string | null;
  reload: () => void;
  createExercise: (input: ExerciseInput) => Promise<Exercise>;
  updateExercise: (id: number, input: ExerciseInput) => Promise<Exercise>;
};

export function useExercises(): ExercisesState {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setPending(true);
    apiGetCached<Exercise[]>("/api/exercises")
      .then((list) => {
        if (alive) {
          setExercises(list);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Error de red");
      })
      .finally(() => {
        if (alive) setPending(false);
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const createExercise = useCallback(
    async (input: ExerciseInput) => {
      const created = await apiFetch<Exercise>("/api/exercises", {
        method: "POST",
        body: JSON.stringify(input),
      });
      reload();
      return created;
    },
    [reload],
  );

  const updateExercise = useCallback(
    async (id: number, input: ExerciseInput) => {
      const updated = await apiFetch<Exercise>(`/api/exercises/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
      reload();
      return updated;
    },
    [reload],
  );

  return {
    exercises,
    pending,
    error,
    reload,
    createExercise,
    updateExercise,
  };
}
