// Pure helpers for the workout-day screen (E6 task 2.3). No React, no fetch.
import type { ShapeName } from "./shapes";

/** `targetSets ?? 3`: the client owns set-row count (design D2). */
export function defaultSetCount(targetSets?: number | null): number {
  return targetSets ?? 3;
}

/** "última: 57.5×8" (o "última: 10 reps" sin peso); null when there is nothing
 * displayable (never logged, or no reps — the API echoes nullable columns). */
export function formatLast(
  last: { weightKg: number | null; reps: number | null } | null,
): string | null {
  if (!last || last.reps === null) return null;
  return last.weightKg === null
    ? `última: ${last.reps} reps`
    : `última: ${last.weightKg}×${last.reps}`;
}

export type Marks = { weightKg: number | null; reps: number | null };

/** Series por ejercicio en el registro: suelo 1 (ahí se apaga el ➖) y techo 20. */
export const MIN_SETS = 1;
export const MAX_SETS = 20;

/** Serie nueva del ➕: copia las marcas de la última y nace sin marcar. */
export function addedSet(sets: readonly Marks[]): Marks {
  const last = sets[sets.length - 1];
  return { weightKg: last?.weightKg ?? null, reps: last?.reps ?? null };
}

/** Serie con sus marcas completas: kilos y reps, o solo reps si va sin peso. */
export function isSetFilled(set: Marks, noWeight: boolean): boolean {
  return set.reps !== null && (noWeight || set.weightKg !== null);
}

/** Un ejercicio registrado «sin peso»: ninguna serie con kilos y alguna con reps. */
export function isNoWeight(sets: readonly Marks[]): boolean {
  return (
    sets.some((s) => s.reps !== null) && sets.every((s) => s.weightKg === null)
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
  const marks = sets.filter((s) => s.reps !== null || s.weightKg !== null);
  if (marks.length === 0) return null;
  return `${formatShortDate(date)}: ${marks.map(formatSetText).join(" · ")}`;
}

/** Marcas de una serie de la sesión igual: siempre con repeticiones (las series
 * sin ellas no se ofrecen) y kilos solo si ese día los hubo. */
export type HomologMarks = { weightKg: number | null; reps: number };

/** Series de la sesión igual indexadas por su `setIndex`: la homóloga de cada
 * serie del borrador. `null` donde no hay homóloga o no tiene reps que copiar. */
export function previousMarks(
  sets: readonly {
    setIndex: number;
    weightKg: number | null;
    reps: number | null;
  }[],
): (HomologMarks | null)[] {
  const size = sets.reduce((max, s) => Math.max(max, s.setIndex + 1), 0);
  const out: (HomologMarks | null)[] = Array.from({ length: size }, () => null);
  for (const s of sets)
    if (s.reps !== null)
      out[s.setIndex] = { weightKg: s.weightKg, reps: s.reps };
  return out;
}

/** Marca copiada de la serie homóloga: las reps siempre y los kilos solo si la
 * igual los trae (con «sin peso» no se escriben). Copiar **nunca** marca la
 * serie: queda desmarcada y sin `touched`, así que completarla sigue siendo cosa
 * del usuario — ni el conmutador «Sin peso» la re-marca después. */
export function copiedMarks<
  T extends Marks & { done: boolean; touched: boolean },
>(target: T, src: HomologMarks, noWeight: boolean): T {
  return {
    ...target,
    reps: src.reps,
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

/** Text values: "60×8", "12 reps" sin peso, or "—" when there is nothing. */
export function formatSetText(set: Marks): string {
  if (set.weightKg === null && set.reps === null) return "—";
  if (set.weightKg === null) return `${set.reps} reps`;
  return `${set.weightKg}×${set.reps ?? "—"}`;
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
