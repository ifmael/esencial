// Pure helpers for the workout-day screen (E6 task 2.3). No React, no fetch.

/** `targetSets ?? 3`: the client owns set-row count (design D2). */
export function defaultSetCount(targetSets?: number | null): number {
  return targetSets ?? 3;
}

/** "última: 57.5×8"; null when there is nothing displayable (never logged,
 * or the last row carries null weight/reps — the API echoes nullable columns). */
export function formatLast(
  last: { weightKg: number | null; reps: number | null } | null,
): string | null {
  return last && last.weightKg !== null && last.reps !== null
    ? `última: ${last.weightKg}×${last.reps}`
    : null;
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

/** Text values in state B: "60×8" or "—" when either side is null. */
export function formatSetText(set: {
  weightKg: number | null;
  reps: number | null;
}): string {
  if (set.weightKg === null && set.reps === null) return "—";
  return `${set.weightKg ?? "—"}×${set.reps ?? "—"}`;
}
