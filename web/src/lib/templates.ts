// useTemplates hook (E4, E2 useRecipes pattern): agrupaciones semánticas de
// ejercicios (fuerza y/o cardio) en orden alfabético + mutate + refetch.
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import type { ExerciseKind } from "./exercises";
import type { TemplatePayload } from "./template-draft";

export type TemplateExerciseRow = {
  id: number;
  exerciseId: number;
  position: number;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDistanceKm: number | null;
  targetDurationMin: number | null;
  exerciseName: string;
  kind: ExerciseKind;
};

export type Template = {
  id: number;
  name: string;
  exercises: TemplateExerciseRow[];
};

export type TemplatesState = {
  templates: Template[];
  pending: boolean;
  error: string | null;
  reload: () => void;
  createTemplate: (payload: TemplatePayload) => Promise<Template>;
  updateTemplate: (id: number, payload: TemplatePayload) => Promise<Template>;
  deleteTemplate: (id: number) => Promise<void>;
};

export function useTemplates(): TemplatesState {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setPending(true);
    apiFetch<Template[]>("/api/templates")
      .then((list) => {
        if (alive) {
          setTemplates(list);
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

  const createTemplate = useCallback(
    async (payload: TemplatePayload) => {
      const created = await apiFetch<Template>("/api/templates", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      reload();
      return created;
    },
    [reload],
  );

  const updateTemplate = useCallback(
    async (id: number, payload: TemplatePayload) => {
      const updated = await apiFetch<Template>(`/api/templates/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      reload();
      return updated;
    },
    [reload],
  );

  const deleteTemplate = useCallback(
    async (id: number) => {
      await apiFetch<void>(`/api/templates/${id}`, { method: "DELETE" });
      reload();
    },
    [reload],
  );

  return {
    templates,
    pending,
    error,
    reload,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
