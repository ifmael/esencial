// Recompensa al completar (dirección D): lógica pura, sin React ni reloj.
import { isoWeekOf, shiftIsoWeek } from "./iso-week";

/** Completa = hay algo que marcar y está todo marcado (series y cardio). */
export function isSessionComplete(
  exercises: { sets: { done: boolean }[] }[],
  cardio: { done: boolean }[],
): boolean {
  const marks = [...exercises.flatMap((e) => e.sets), ...cardio];
  return marks.length > 0 && marks.every((m) => m.done);
}

const weekOf = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return isoWeekOf(new Date(Date.UTC(y, m - 1, d)));
};

/** Semanas ISO seguidas con al menos una sesión registrada, contando hacia
 * atrás desde la de `today`. La semana en curso sin registrar aún no la rompe:
 * la racha sigue viva hasta que acaba la semana. */
export function weekStreak(
  sessions: { date: string; status: "planned" | "logged" }[],
  today: string,
): number {
  const weeks = new Set(
    sessions.filter((s) => s.status === "logged").map((s) => weekOf(s.date)),
  );
  let week = weekOf(today);
  if (!weeks.has(week)) week = shiftIsoWeek(week, -1);
  let streak = 0;
  while (weeks.has(week)) {
    streak++;
    week = shiftIsoWeek(week, -1);
  }
  return streak;
}
