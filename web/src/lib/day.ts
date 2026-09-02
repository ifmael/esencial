// E5 (design D4): un fetch por fecha a /api/day/:date con estado { data,
// loading, error, reload }. Las respuestas de fechas ya superadas se descartan.
import { useEffect, useRef, useState } from "react";

export type DayMeal = { meal: string; recipeId: number | null; recipeName: string | null };

export type DaySession = {
  id: number;
  templateId: number;
  templateName: string;
  status: "planned" | "logged";
  summary: { effort: number; exercises: number; sets: number } | null;
};

export type DayData = {
  date: string;
  isoWeek: string;
  dayIndex: number;
  meals: DayMeal[];
  session: DaySession | null;
  note: { text: string };
};

export type DayState = {
  data: DayData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/** YYYY-MM-DD en hora local — "hoy" se decide en el cliente, nunca en el Worker. */
export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function useDay(date: string): DayState {
  const [data, setData] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const current = useRef(date);
  current.current = date;

  useEffect(() => {
    let live = true;
    setData(null); // nada de datos rancios mientras carga la nueva fecha
    setLoading(true);
    setError(null);
    fetch(`/api/day/${date}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<DayData>;
      })
      .then((d) => {
        if (live && current.current === date) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (live && current.current === date) {
          setError("No se pudo cargar el día.");
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [date, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}
