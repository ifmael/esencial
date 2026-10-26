// usePlanWeek (tasks 1.2, patrón useMealPlan): sesiones de la semana ISO.
// El GET devuelve TODAS las sesiones (id/date/name/status); el hook filtra por
// semana ISO en cliente. Tras un POST/PUT/DELETE fallido se recarga primero y el
// error se fija después, para que el mensaje sobreviva a la re-sincronización.
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "./api";
import { toISODate } from "./day";
import type { ExerciseKind, ExerciseMetric } from "./exercises";
import { isoWeekOfDay } from "./iso-week";
import { weekStreak } from "./reward";

export type PlanSession = {
  id: number;
  date: string;
  name: string | null;
  status: "planned" | "logged";
  /** Ejercicios del día, ordenados por posición (desglose en la rejilla). */
  exercises: SessionExercise[];
};

/** Ejercicio planificado en el día (wire de GET /api/plan-sessions/:id). */
export type SessionExercise = {
  id: number;
  exerciseId: number;
  exerciseName: string;
  kind: ExerciseKind;
  /** Unidad de la serie (solo fuerza): decide qué campos se registran. */
  metric: ExerciseMetric;
  position: number;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDistanceKm: number | null;
  targetDurationMin: number | null;
  /** Descansos programados (segundos): entre series y al terminar el ejercicio. */
  restSecs: number | null;
  restAfterSecs: number | null;
  /** `true` = va pegado al ejercicio siguiente (bloque/superserie). */
  superset: boolean;
};

/** Fila editable del editor del día (lo que viaja en items[]). */
export type SessionItem = {
  exerciseId: number;
  targetSets?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDistanceKm?: number | null;
  targetDurationMin?: number | null;
  restSecs?: number | null;
  restAfterSecs?: number | null;
  superset?: boolean;
};

export type SessionPayload = {
  name?: string | null;
  items: SessionItem[];
};

/** Items del día para el PUT del plan desde el registro: la fuerza viaja con las
 * series que tiene el borrador (`setCounts`, por id de item) y el resto de
 * objetivos se conserva tal cual. Respeta el orden del array —el arrastre del
 * calendario reordena la lista, no la `position` de cada item. */
export function planItems(
  exercises: readonly SessionExercise[],
  setCounts: ReadonlyMap<number, number>,
): SessionItem[] {
  return exercises.map((e) => ({
    exerciseId: e.exerciseId,
    targetSets: setCounts.get(e.id) ?? e.targetSets,
    targetRepsMin: e.targetRepsMin,
    targetRepsMax: e.targetRepsMax,
    targetDistanceKm: e.targetDistanceKm,
    targetDurationMin: e.targetDurationMin,
    restSecs: e.restSecs,
    restAfterSecs: e.restAfterSecs,
    superset: e.superset,
  }));
}

/** POST que vuelve a crear una sesión desprogramada («Deshacer»). */
export function recreatePayload(
  session: PlanSession,
): SessionPayload & { date: string } {
  return {
    date: session.date,
    name: session.name,
    items: planItems(session.exercises, new Map()),
  };
}

function msg(e: unknown): string {
  return e instanceof ApiError && e.error
    ? e.error
    : "No se pudo conectar con el servidor";
}

export function usePlanWeek(isoWeek: string) {
  const [sessions, setSessions] = useState<PlanSession[]>([]);
  // Todas las sesiones del usuario (todas las semanas): la copia de un día
  // ofrece cualquier día guardado y la semanal, las semanas anteriores.
  const [allSessions, setAllSessions] = useState<PlanSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Racha semanal: sale del GET completo (todas las semanas), no de la filtrada.
  const [streak, setStreak] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await apiGet<PlanSession[]>("/api/plan-sessions");
      // Week filter via Monday-anchored ISO week of "YYYY-MM-DD" (no clock).
      setSessions(all.filter((s) => isoWeekOfDay(s.date) === isoWeek));
      setAllSessions(all);
      setStreak(weekStreak(all, toISODate(new Date())));
      setError(null);
    } catch {
      setSessions([]);
      setAllSessions([]);
      setError("No se pudo cargar la semana.");
    } finally {
      setLoading(false);
    }
  }, [isoWeek]);

  useEffect(() => {
    void load();
  }, [isoWeek, load]);

  const reload = useCallback(() => load(), [load]);

  /** true si el DELETE salió bien (la página ofrece entonces «Deshacer»). */
  const remove = useCallback(
    async (id: number) => {
      try {
        await apiSend(`/api/plan-sessions/${id}`, "DELETE", {});
        await load();
        return true;
      } catch (e) {
        await load();
        setError(msg(e));
        return false;
      }
    },
    [load],
  );

  /** Guarda los items del día (reordenar, o quitar uno): el PUT borra y
   *  reinserta con position = índice. Optimista: la celda reacciona al soltar;
   *  el PUT confirma o revierte (load). true si el PUT salió bien. */
  const saveItems = useCallback(
    async (session: PlanSession, exercises: SessionExercise[]) => {
      setSessions((all) =>
        all.map((s) =>
          s.id === session.id
            ? {
                ...s,
                exercises: exercises.map((e, i) => ({ ...e, position: i })),
              }
            : s,
        ),
      );
      try {
        await apiSend(`/api/plan-sessions/${session.id}`, "PUT", {
          name: session.name,
          items: planItems(exercises, new Map()),
        });
        await load();
        return true;
      } catch (e) {
        await load();
        setError(msg(e));
        return false;
      }
    },
    [load],
  );

  /** Vuelve a crear una sesión desprogramada (el «Deshacer» del DELETE). */
  const recreate = useCallback(
    async (session: PlanSession) => {
      try {
        await apiSend("/api/plan-sessions", "POST", recreatePayload(session));
        await load();
      } catch (e) {
        await load();
        setError(msg(e));
      }
    },
    [load],
  );

  return {
    sessions,
    /** Todas las sesiones del usuario, de cualquier semana. */
    all: allSessions,
    loading,
    error,
    streak,
    reload,
    remove,
    saveItems,
    recreate,
  };
}
