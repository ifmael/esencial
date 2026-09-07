// ISO-8601 weeks, Monday-anchored (agreed with E5; meal_slots.day 0=Lunes).
// Pure helpers so the 2026-W53 → 2027-W01 edge is unit-tested without a clock.
const WEEK_MS = 7 * 86_400_000;

/** Monday of ISO week 1 of `isoYear` (Jan 4 is always in W1). */
function firstIsoMonday(isoYear: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const dow = (jan4.getUTCDay() + 6) % 7; // Monday=0 … Sunday=6
  return new Date(jan4.getTime() - dow * 86_400_000);
}

/** ISO week ("YYYY-Www") of a date (UTC getters; any Date works). */
export function isoWeekOf(date: Date): string {
  // Thursday of the date's week fixes the ISO year unambiguously.
  const thu = new Date(date.getTime());
  thu.setUTCDate(thu.getUTCDate() - ((thu.getUTCDay() + 6) % 7) + 3);
  const year = thu.getUTCFullYear();
  const week =
    Math.floor((thu.getTime() - firstIsoMonday(year).getTime()) / WEEK_MS) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function currentIsoWeek(): string {
  return isoWeekOf(new Date());
}

/** shiftIsoWeek("2026-W53", 1) === "2027-W01"; year boundaries handled. */
export function shiftIsoWeek(isoWeek: string, delta: number): string {
  const [year, week] = isoWeek.split("-W").map(Number);
  const monday = new Date(
    firstIsoMonday(year).getTime() + (week - 1 + delta) * WEEK_MS,
  );
  return isoWeekOf(monday);
}
