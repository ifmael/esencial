// Historial (A y C): el índice de días registrados y las series de un
// ejercicio por día. Los dos endpoints comparten la paginación por cursor
// (`?before=&limit=`, con `next` en la respuesta), así que comparten hook.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./api";
import { toISODate } from "./day";
import { formatSetText, parseDateEs } from "./workout";

/** Filas por página: cortas para que el móvil no cargue un histórico entero. */
export const HISTORY_PAGE = 20;

/** Un día registrado con lo hecho (series y cardio **marcados**). */
export type HistoryDay = {
  date: string;
  sessionName: string | null;
  effort: number;
  note: string | null;
  exercises: number;
  sets: number;
  cardio: number;
};

export type ExerciseMark = {
  setIndex: number;
  weightKg: number | null;
  reps: number;
};

export type CardioMark = {
  distanceKm: number | null;
  durationMin: number | null;
};

/** Un día del historial de un ejercicio: sus series (fuerza) o su cardio. */
export type ExerciseHistorySession = {
  date: string;
  sessionName: string | null;
  sets: ExerciseMark[];
  cardio: CardioMark | null;
};

/** Respuestas de los dos endpoints (el `next` es el cursor de la página). */
export type HistoryDayPage = { days: HistoryDay[]; next: string | null };
export type ExerciseHistoryPage = {
  exerciseId: number;
  kind: string;
  sessions: ExerciseHistorySession[];
  next: string | null;
};

const DAYS_OF = (page: HistoryDayPage) => page.days;
const SESSIONS_OF = (page: ExerciseHistoryPage) => page.sessions;

export type HistoryState<T> = {
  items: T[];
  next: string | null;
  pending: boolean;
  /** Cargando la página siguiente (las que ya están siguen en pantalla). */
  loadingMore: boolean;
  error: string | null;
  loadMore: () => void;
  reload: () => void;
};

/** Rango de fechas pedido a la API, con los dos extremos incluidos; `""` en un
 *  lado significa «sin límite» por ahí. */
export type HistoryRange = { from: string; to: string };
export const NO_RANGE: HistoryRange = { from: "", to: "" };

/** La fecha «desde» va por delante de la «hasta»: no hay nada que pedir. */
export function rangeIsBackwards(range: HistoryRange): boolean {
  return range.from !== "" && range.to !== "" && range.from > range.to;
}

/** `from`/`to` de los últimos N meses (el día de hoy queda dentro). */
export function monthsBack(months: number, today = new Date()): HistoryRange {
  const from = new Date(today);
  from.setMonth(from.getMonth() - months);
  return { from: toISODate(from), to: "" };
}

/** Rango preseleccionado activo, o null si las fechas no son las suyas. */
export function sameRange(a: HistoryRange, b: HistoryRange): boolean {
  return a.from === b.from && a.to === b.to;
}

/** URL de una página del histórico: `limit` primero y `before` después (el
 *  orden lo atan los tests y el e2e); el rango va detrás. */
function pageUrl(
  path: string,
  limit: number,
  before: string | null,
  range: HistoryRange,
): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before !== null) params.set("before", before);
  if (range.from !== "") params.set("from", range.from);
  if (range.to !== "") params.set("to", range.to);
  return `${path}?${params}`;
}

/** Índice del histórico y el de un ejercicio: misma página, distinto extractor. */
function useHistoryPage<T, P extends { next: string | null }>(
  path: string,
  pick: (page: P) => T[],
  range: HistoryRange = NO_RANGE,
  limit = HISTORY_PAGE,
): HistoryState<T> {
  // Solo los dos extremos: el objeto del rango puede ser nuevo en cada render.
  const { from, to } = range;
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  /** Generación de la lista: una respuesta que llega después de una recarga (o
   *  de otro «Ver más») se descarta; si no, pegaría la página vieja encima de la
   *  nueva y pisaría su cursor. */
  const generation = useRef(0);

  // `pick` y `limit` los fija quien llama (constantes), así que el efecto solo
  // vuelve a correr al recargar.
  useEffect(() => {
    const mine = ++generation.current;
    let alive = true;
    setPending(true);
    setError(null);
    // Rango al revés: no se pide nada y la pantalla lo dice (la lista que hay
    // se queda, como cuando falla una petición).
    if (rangeIsBackwards({ from, to })) {
      setPending(false);
      setError("La fecha «Desde» es posterior a «Hasta»");
      return;
    }
    // Un «Ver más» en vuelo es de la generación anterior: se descarta también su
    // indicador (si no, el botón se queda deshabilitado para siempre).
    setLoadingMore(false);
    apiGet<P>(pageUrl(path, limit, null, { from, to }))
      .then((page) => {
        if (!alive || mine !== generation.current) return;
        setItems(pick(page));
        setNext(page.next);
      })
      .catch((e: unknown) => {
        if (alive && mine === generation.current)
          setError(e instanceof Error ? e.message : "Error de red");
      })
      .finally(() => {
        if (alive && mine === generation.current) setPending(false);
      });
    return () => {
      alive = false;
    };
  }, [path, limit, pick, from, to, nonce]);

  const loadMore = useCallback(() => {
    if (next === null) return;
    const mine = generation.current;
    setLoadingMore(true);
    apiGet<P>(pageUrl(path, limit, next, { from, to }))
      .then((page) => {
        if (mine !== generation.current) return;
        setItems((prev) => [...prev, ...pick(page)]);
        setNext(page.next);
      })
      .catch((e: unknown) => {
        if (mine === generation.current)
          setError(e instanceof Error ? e.message : "Error de red");
      })
      .finally(() => {
        if (mine === generation.current) setLoadingMore(false);
      });
  }, [path, limit, next, pick, from, to]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { items, next, pending, loadingMore, error, loadMore, reload };
}

/** Índice de días registrados (lo consume /historial). */
export function useWorkoutHistory(
  range: HistoryRange = NO_RANGE,
): HistoryState<HistoryDay> {
  return useHistoryPage<HistoryDay, HistoryDayPage>(
    "/api/workout-logs",
    DAYS_OF,
    range,
  );
}

/** Historial de un ejercicio (lo consume su ficha). */
export function useExerciseHistory(
  exerciseId: number,
  range: HistoryRange = NO_RANGE,
): HistoryState<ExerciseHistorySession> {
  return useHistoryPage<ExerciseHistorySession, ExerciseHistoryPage>(
    `/api/exercises/${exerciseId}/history`,
    SESSIONS_OF,
    range,
  );
}

const MONTH_LABEL = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
});

export type HistoryMonth = { key: string; label: string; days: HistoryDay[] };

/** Agrupa por mes respetando el orden recibido (del más nuevo al más viejo). */
export function groupByMonth(days: readonly HistoryDay[]): HistoryMonth[] {
  const months: HistoryMonth[] = [];
  for (const day of days) {
    const key = day.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === key) last.days.push(day);
    else
      months.push({
        key,
        label: MONTH_LABEL.format(parseDateEs(`${key}-01`)),
        days: [day],
      });
  }
  return months;
}

/** El día tiene algo marcado (series hechas o cardio): si no, no hay volumen
 *  que pintar y la fila lo dice. */
export function hasMarks(day: HistoryDay): boolean {
  return day.exercises > 0 || day.sets > 0 || day.cardio > 0;
}

const VOLUME_WORDS = {
  exercises: ["ejercicio", "ejercicios"],
  sets: ["serie", "series"],
  cardio: ["cardio", "cardios"],
} as const satisfies Record<string, readonly [string, string]>;

export type VolumeKind = keyof typeof VOLUME_WORDS;

/** «3 ejercicios», «1 serie», «2 cardios»: el nombre de un dato del volumen.
 *  Es lo que llevan el `aria-label` y el `title` de su icono en la fila. */
export function volumeLabel(kind: VolumeKind, count: number): string {
  const [one, many] = VOLUME_WORDS[kind];
  return `${count} ${count === 1 ? one : many}`;
}

/** «60×8 · 60×7» de las series marcadas de un día; null si no hay marcas. */
export function marksText(sets: readonly ExerciseMark[]): string | null {
  if (sets.length === 0) return null;
  return sets.map((s) => formatSetText(s)).join(" · ");
}

/** La mejor serie del historial: más kilos y, a igualdad, más repeticiones.
 *  Sin kilos («sin peso») compite como peso 0, así que nunca gana a una con
 *  carga. null si no hay ninguna serie. */
export function bestMark(sets: readonly ExerciseMark[]): ExerciseMark | null {
  let best: ExerciseMark | null = null;
  for (const s of sets) {
    if (best === null) {
      best = s;
      continue;
    }
    const weight = s.weightKg ?? 0;
    const bestWeight = best.weightKg ?? 0;
    if (weight > bestWeight || (weight === bestWeight && s.reps > best.reps))
      best = s;
  }
  return best;
}

/** «5 km · 30 min» del cardio de un día; null sin distancia ni tiempo. */
export function cardioText(mark: CardioMark | null): string | null {
  if (!mark || (mark.distanceKm === null && mark.durationMin === null))
    return null;
  const parts: string[] = [];
  if (mark.distanceKm !== null) parts.push(`${mark.distanceKm} km`);
  if (mark.durationMin !== null) parts.push(`${mark.durationMin} min`);
  return parts.join(" · ");
}
