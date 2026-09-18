// useExercises hook (E4, E2 useRecipes pattern): full list + mutate + refetch.
// kind: fuerza (series/reps) o cardio (distancia/tiempo).
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";

export type ExerciseKind = "strength" | "running" | "bike";

export const KIND_LABELS: Record<ExerciseKind, string> = {
  strength: "Fuerza",
  running: "Running",
  bike: "Bici",
};

export type Exercise = {
  id: number;
  name: string;
  description: string | null;
  setupCues: string | null;
  techniqueUrl: string | null;
  steps: string[] | null;
  tags: string[];
  kind: ExerciseKind;
};

export type ExerciseInput = {
  name: string;
  description?: string | null;
  setupCues?: string | null;
  techniqueUrl?: string | null;
  steps?: string[] | null;
  tags: string[];
  /** Ausente = el servidor aplica "strength". */
  kind?: ExerciseKind;
};

export type ExercisesState = {
  exercises: Exercise[];
  pending: boolean;
  error: string | null;
  reload: () => void;
  createExercise: (input: ExerciseInput) => Promise<Exercise>;
  updateExercise: (id: number, input: ExerciseInput) => Promise<Exercise>;
  deleteExercise: (id: number) => Promise<void>;
};

export function useExercises(): ExercisesState {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setPending(true);
    apiFetch<Exercise[]>("/api/exercises")
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

  const deleteExercise = useCallback(
    async (id: number) => {
      await apiFetch<void>(`/api/exercises/${id}`, { method: "DELETE" });
      reload();
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
    deleteExercise,
  };
}
