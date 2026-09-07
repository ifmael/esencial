// usePlanWeek (tasks 1.2, patrón useMealPlan): sesiones de la semana ISO.
// El GET devuelve TODAS las sesiones; el hook filtra por semana ISO en cliente.
// Tras un POST/DELETE fallido se recarga primero y el error se fija después,
// para que el mensaje sobreviva a la re-sincronización del estado.
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "./api";

export type PlanSession = {
  id: number;
  date: string;
  status: "planned" | "logged";
  templateId: number;
  templateName: string;
};

function msg(e: unknown): string {
  return e instanceof ApiError && e.error
    ? e.error
    : "No se pudo conectar con el servidor";
}

export function usePlanWeek(isoWeek: string) {
  const [sessions, setSessions] = useState<PlanSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await apiGet<PlanSession[]>("/api/plan-sessions");
      // Week filter via Monday-anchored ISO week of "YYYY-MM-DD" (no clock).
      setSessions(
        all.filter((s) => {
          const [y, m, d] = s.date.split("-").map(Number);
          const date = new Date(Date.UTC(y, m - 1, d));
          const thu = new Date(date.getTime());
          thu.setUTCDate(thu.getUTCDate() - ((thu.getUTCDay() + 6) % 7) + 3);
          return isoWeekOf(thu) === isoWeek;
        }),
      );
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

  const create = useCallback(
    async (date: string, templateId: number) => {
      try {
        await apiSend("/api/plan-sessions", "POST", { date, templateId });
        await load();
      } catch (e) {
        await load();
        setError(msg(e));
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        await apiSend(`/api/plan-sessions/${id}`, "DELETE", {});
        await load();
      } catch (e) {
        await load();
        setError(msg(e));
      }
    },
    [load],
  );

  return { sessions, loading, error, reload, create, remove };
}

/** ISO week ("YYYY-Www") of the UTC date `thu` belongs to (mirror of iso-week.ts). */
function isoWeekOf(date: Date): string {
  const year = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(
    jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000,
  );
  const week =
    Math.floor((date.getTime() - monday.getTime()) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}
