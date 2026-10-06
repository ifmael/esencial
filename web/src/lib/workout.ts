// Pure helpers for the workout-day screen (E6 task 2.3). No React, no fetch.
import type { ExerciseKind, ExerciseMetric } from "./exercises";
import type { ShapeName } from "./shapes";

// --- Bloques (superseries) --------------------------------------------------

/** Fila con la marca de bloque: lo mínimo que necesitan las reglas puras. */
export type BlockRow = { superset?: boolean | null; kind: ExerciseKind };

/** [inicio, fin] del bloque que contiene `index` (él solo si va suelto). */
export function blockRange(
  rows: readonly BlockRow[],
  index: number,
): [number, number] {
  let start = index;
  while (start > 0 && rows[start - 1].superset) start--;
  let end = index;
  while (end < rows.length - 1 && rows[end].superset) end++;
  return [start, end];
}

/** Los bloques de la lista, en orden: los índices de cada uno (≥1). */
export function blocks(rows: readonly BlockRow[]): number[][] {
  const out: number[][] = [];
  let i = 0;
  while (i < rows.length) {
    const [start, end] = blockRange(rows, i);
    out.push(Array.from({ length: end - start + 1 }, (_, k) => start + k));
    i = end + 1;
  }
  return out;
}

/** Quita las marcas que no pueden ser —solo une fuerza con fuerza y nunca la
 *  última fila— y deja `superset` booleano en todas. */
export function normalizeSupersets<T extends BlockRow>(
  rows: readonly T[],
): T[] {
  return rows.map((row, i) => ({
    ...row,
    superset:
      Boolean(row.superset) &&
      row.kind === "strength" &&
      rows[i + 1] !== undefined &&
      rows[i + 1].kind === "strength",
  }));
}

/** Nombre del bloque por su tamaño: 2 · 3 · 4 o más. */
export function blockLabel(size: number): string {
  if (size === 3) return "Triserie";
  if (size >= 4) return "Serie gigante";
  return "Superserie";
}

/** Lo que necesita la regla de avance del modo sesión (fuerza o cardio). */
export type StepItem = {
  kind: ExerciseKind;
  /** `true` = va pegado al siguiente. */
  superset: boolean;
  /** Series del ejercicio; null en el cardio. */
  sets: readonly { done: boolean }[] | null;
  restSecs: number | null;
  restAfterSecs: number | null;
};

/** Qué toca tras marcar una serie: `move` salta sin pausa, `pause` arranca la
 *  cuenta (`owner` es el ejercicio que la nombra) y `end` cierra la sesión. */
export type SessionStep =
  | { kind: "stay" }
  | { kind: "move"; to: number }
  | { kind: "pause"; pause: "sets" | "after"; seconds: number; owner: number }
  | { kind: "end" };

/** Qué toca tras marcar la serie `marked` del ejercicio `index` (en un bloque,
 *  la vuelta la define la serie marcada: no lo que quede pendiente). */
export function nextAfterSet(
  items: readonly StepItem[],
  index: number,
  marked: number,
): SessionStep {
  const last = items.length - 1;
  const item = items[index];
  const [start, end] = blockRange(items, index);

  // Serie recta (o cardio, que no tiene series): el comportamiento de siempre.
  if (start === end) {
    const isLastSet = item.sets === null || marked === item.sets.length - 1;
    if (!isLastSet) {
      return item.restSecs !== null
        ? { kind: "pause", pause: "sets", seconds: item.restSecs, owner: index }
        : { kind: "stay" };
    }
    if (end === last) return { kind: "end" };
    return item.restAfterSecs !== null
      ? {
          kind: "pause",
          pause: "after",
          seconds: item.restAfterSecs,
          owner: index,
        }
      : { kind: "move", to: index + 1 };
  }

  // Bloque: ¿queda algún miembro que tenga que hacer ESTA serie (la vuelta)?
  const inRound = (j: number) =>
    (items[j].sets?.length ?? 0) > marked && !items[j].sets?.[marked]?.done;
  for (let j = index + 1; j <= end; j++)
    if (inRound(j)) return { kind: "move", to: j };

  // Cerró la vuelta: si el bloque sigue vivo, vuelve al primero que tenga una
  // serie más (el descanso, si lo hay, es el del último miembro).
  const owner = items[end];
  let first = -1;
  for (let j = start; j <= end; j++)
    if ((items[j].sets?.length ?? 0) > marked + 1) {
      first = j;
      break;
    }
  if (first !== -1) {
    return owner.restSecs !== null
      ? { kind: "pause", pause: "sets", seconds: owner.restSecs, owner: end }
      : { kind: "move", to: first };
  }

  // Bloque terminado: descanso de fin (del último miembro) o al siguiente.
  if (end === last) return { kind: "end" };
  return owner.restAfterSecs !== null
    ? {
        kind: "pause",
        pause: "after",
        seconds: owner.restAfterSecs,
        owner: end,
      }
    : { kind: "move", to: end + 1 };
}

/** Series con las que nace un ejercicio de fuerza sin recuento propio: al
 *  añadirlo a una sesión (o al expandir una plantilla) y al abrir su registro. */
export const DEFAULT_SETS = 3;

/** `targetSets ?? DEFAULT_SETS`: the client owns set-row count (design D2). */
export function defaultSetCount(targetSets?: number | null): number {
  return targetSets ?? DEFAULT_SETS;
}

/** "última: 57.5×8" (o "última: 10 reps" sin peso, o "última: 45 s" por
 *  tiempo); null when there is nothing displayable (never logged, or an empty
 *  mark — the API echoes nullable columns). */
export function formatLast(last: Marks | null): string | null {
  if (!last) return null;
  const text = formatSetText(last);
  return text === "—" ? null : `última: ${text}`;
}

/** Marcas de una serie: kilos, repeticiones y/o segundos según la métrica. */
export type Marks = {
  weightKg: number | null;
  reps: number | null;
  durationSecs: number | null;
};

/** Qué pide una serie según la métrica del ejercicio. El «sin peso» de la
 *  sesión solo suelta los kilos de la métrica de kilos (`weight_reps`). */
export type SetFields = { weight: boolean; reps: boolean; time: boolean };

export function setFields(metric: ExerciseMetric, noWeight = false): SetFields {
  switch (metric) {
    case "reps":
      return { weight: false, reps: true, time: false };
    case "time":
      return { weight: false, reps: false, time: true };
    case "weight_time":
      return { weight: true, reps: false, time: true };
    default:
      return { weight: !noWeight, reps: true, time: false };
  }
}

/** Series por ejercicio en el registro: suelo 1 (ahí se apaga el ➖) y techo 20. */
export const MIN_SETS = 1;
export const MAX_SETS = 20;

/** Serie nueva del ➕: copia las marcas de la última y nace sin marcar. */
export function addedSet(sets: readonly Marks[]): Marks {
  const last = sets[sets.length - 1];
  return {
    weightKg: last?.weightKg ?? null,
    reps: last?.reps ?? null,
    durationSecs: last?.durationSecs ?? null,
  };
}

/** Serie con sus marcas completas según lo que pida su métrica. */
export function isSetFilled(set: Marks, fields: SetFields): boolean {
  return (
    (!fields.weight || set.weightKg != null) &&
    (!fields.reps || set.reps != null) &&
    (!fields.time || set.durationSecs != null)
  );
}

/** Un ejercicio registrado «sin peso»: ninguna serie con kilos y alguna con reps. */
export function isNoWeight(sets: readonly Marks[]): boolean {
  return (
    sets.some((s) => s.reps != null) && sets.every((s) => s.weightKg == null)
  );
}

/** Última sesión registrada con el mismo nombre y fecha anterior; sin nombre no empareja. */
export function previousSession<
  T extends { date: string; name: string | null; status: string },
>(sessions: readonly T[], date: string, name: string | null): T | null {
  if (name === null) return null;
  let best: T | null = null;
  for (const s of sessions)
    if (
      s.status === "logged" &&
      s.name === name &&
      s.date < date &&
      (!best || s.date > best.date)
    )
      best = s;
  return best;
}

const SHORT_DATE = new Intl.DateTimeFormat("es", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/** «sáb, 26/09» — la fecha corta que comparten el historial y las series de la
 *  sesión igual. */
export function formatShortDate(date: string): string {
  return SHORT_DATE.format(parseDateEs(date));
}

/** "sáb, 26/09: 60×10 · 55×8" — las series sin marcas no aparecen. */
export function formatPrevious(
  date: string,
  sets: readonly Marks[],
): string | null {
  const marks = sets.filter(
    (s) => s.reps != null || s.weightKg != null || s.durationSecs != null,
  );
  if (marks.length === 0) return null;
  return `${formatShortDate(date)}: ${marks.map(formatSetText).join(" · ")}`;
}

/** Marcas de una serie de la sesión igual: siempre con algo que copiar (las
 *  series vacías no se ofrecen) y kilos solo si ese día los hubo. */
export type HomologMarks = {
  weightKg: number | null;
  reps: number | null;
  durationSecs: number | null;
};

/** Series de la sesión igual indexadas por su `setIndex`: la homóloga de cada
 *  serie del borrador. `null` donde no hay homóloga o está vacía. */
export function previousMarks(
  sets: readonly {
    setIndex: number;
    weightKg: number | null;
    reps: number | null;
    durationSecs: number | null;
  }[],
): (HomologMarks | null)[] {
  const size = sets.reduce((max, s) => Math.max(max, s.setIndex + 1), 0);
  const out: (HomologMarks | null)[] = Array.from({ length: size }, () => null);
  for (const s of sets)
    if (s.reps != null || s.durationSecs != null)
      out[s.setIndex] = {
        weightKg: s.weightKg,
        reps: s.reps,
        durationSecs: s.durationSecs,
      };
  return out;
}

/** Marca copiada de la serie homóloga: las reps y los segundos siempre, y los
 *  kilos solo si la igual los trae (con «sin peso» no se escriben). Copiar
 *  **nunca** marca la serie: queda desmarcada y sin `touched`, así que
 *  completarla sigue siendo cosa del usuario — ni el conmutador «Sin peso» la
 *  re-marca después. */
export function copiedMarks<
  T extends Marks & { done: boolean; touched: boolean },
>(target: T, src: HomologMarks, noWeight: boolean): T {
  return {
    ...target,
    reps: src.reps,
    durationSecs: src.durationSecs,
    weightKg:
      noWeight || src.weightKg === null ? target.weightKg : src.weightKg,
    done: false,
    touched: false,
  };
}

export function noteOrNull(note: string): string | null {
  const trimmed = note.trim();
  return trimmed === "" ? null : trimmed;
}

/** Strict YYYY-MM-DD that names a real calendar day. */
export function isValidDateStr(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return (
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(mo) - 1 &&
    date.getDate() === Number(d)
  );
}

/** Local-midnight Date for a validated YYYY-MM-DD string. */
export function parseDateEs(s: string): Date {
  const [y, mo, d] = s.split("-").map(Number);
  return new Date(y, mo - 1, d);
}

/** Stepper text → wire number; empty stays null. */
export function numOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Esfuerzo percibido (1–5): la etiqueta de cada nivel y la forma que gana al
 *  llenarse. Las comparten el selector de la sesión y la lectura del historial
 *  (`EffortScale`), para que la escala se vea igual en toda la app. */
export const EFFORT_LABELS = [
  "Muy fácil",
  "Fácil",
  "Moderado",
  "Duro",
  "Máximo",
];
export const EFFORT_SHAPES: ShapeName[] = [
  "circle",
  "cookie-4",
  "cookie-7",
  "cookie-9",
  "sunny",
];

/** Text values: "60×8", "12 reps" sin peso, "45 s" o "80 kg × 40 s" por tiempo;
 *  "—" when there is nothing. Tolera un campo ausente (un Worker antiguo sin
 *  `durationSecs` no debe pintar «undefined s»). */
export function formatSetText(set: Marks): string {
  if (set.durationSecs != null)
    return set.weightKg == null
      ? `${set.durationSecs} s`
      : `${set.weightKg} kg × ${set.durationSecs} s`;
  if (set.reps == null && set.weightKg == null) return "—";
  if (set.reps == null) return `${set.weightKg} kg`;
  if (set.weightKg == null) return `${set.reps} reps`;
  return `${set.weightKg}×${set.reps}`;
}

/** Series hechas sobre el total de la sesión; cada cardio cuenta como una. */
export function setsProgress(
  sets: readonly { done: boolean }[],
  cardio: readonly { done: boolean }[],
): { done: number; total: number } {
  const all = [...sets, ...cardio];
  return { done: all.filter((s) => s.done).length, total: all.length };
}

/** Sesiones registradas sobre las planificadas de la semana. */
export function weekProgress(sessions: readonly { status: string }[]): {
  logged: number;
  total: number;
} {
  return {
    logged: sessions.filter((s) => s.status === "logged").length,
    total: sessions.length,
  };
}
