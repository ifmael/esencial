// usePlanWeek (tasks 1.2, patrón useMealPlan): sesiones de la semana ISO.
// El GET devuelve TODAS las sesiones (id/date/name/status); el hook filtra por
// semana ISO en cliente. Tras un POST/PUT/DELETE fallido se recarga primero y el
// error se fija después, para que el mensaje sobreviva a la re-sincronización.
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "./api";
import { toISODate } from "./day";
import type { ExerciseKind } from "./exercises";
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
  position: number;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDistanceKm: number | null;
  targetDurationMin: number | null;
};

/** Fila editable del editor del día (lo que viaja en items[]). */
export type SessionItem = {
  exerciseId: number;
  targetSets?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDistanceKm?: number | null;
  targetDurationMin?: number | null;
};

export type SessionPayload = {
  name?: string | null;
  items: SessionItem[];
};

/** Items del wire (PUT/POST) a partir de los ejercicios del día, en su orden. */
function itemsOf(exercises: SessionExercise[]): SessionItem[] {
  return exercises.map((e) => ({
    exerciseId: e.exerciseId,
    targetSets: e.targetSets,
    targetRepsMin: e.targetRepsMin,
    targetRepsMax: e.targetRepsMax,
    targetDistanceKm: e.targetDistanceKm,
    targetDurationMin: e.targetDurationMin,
  }));
}

/** POST que vuelve a crear una sesión desprogramada («Deshacer»). */
export function recreatePayload(
  session: PlanSession,
): SessionPayload & { date: string } {
  return {
    date: session.date,
    name: session.name,
    items: itemsOf(session.exercises),
  };
}

function msg(e: unknown): string {
  return e instanceof ApiError && e.error
    ? e.error
    : "No se pudo conectar con el servidor";
}

export function usePlanWeek(isoWeek: string) {
  const [sessions, setSessions] = useState<PlanSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Racha semanal: sale del GET completo (todas las semanas), no de la filtrada.
  const [streak, setStreak] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await apiGet<PlanSession[]>("/api/plan-sessions");
      // Week filter via Monday-anchored ISO week of "YYYY-MM-DD" (no clock).
      setSessions(all.filter((s) => isoWeekOf(s.date) === isoWeek));
      setStreak(weekStreak(all, toISODate(new Date())));
      setError(null);
    } catch {
      setSessions([]);
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
          items: itemsOf(exercises),
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
    loading,
    error,
    streak,
    reload,
    remove,
    saveItems,
    recreate,
  };
}

/** ISO week ("YYYY-Www") of a "YYYY-MM-DD" date (UTC, no clock). */
function isoWeekOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const thu = new Date(date.getTime());
  thu.setUTCDate(thu.getUTCDate() - ((thu.getUTCDay() + 6) % 7) + 3);
  const year = thu.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(
    jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000,
  );
  const week =
    Math.floor((thu.getTime() - monday.getTime()) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}
