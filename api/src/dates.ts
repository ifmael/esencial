// E5 (design D2): ISO-8601 calendar mapping as pure functions on the literal
// YYYY-MM-DD string, parsed as UTC. The Worker never reads the clock — "today"
// is a client decision, which keeps these deterministic on the edge runtime.

/** Strict calendar-string check: shape + real date (rejects 2026-13-01, 2026-02-30). */
function utcMs(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d
  )
    return null;
  return t;
}

/** Monday = 0 … Sunday = 6, or null for a malformed date. */
export function dayIndexOf(date: string): number | null {
  const t = utcMs(date);
  if (t === null) return null;
  return (new Date(t).getUTCDay() + 6) % 7;
}

/** `YYYY-Www` ISO-8601 week (Thursday rule), or null for a malformed date. */
export function isoWeekOf(date: string): string | null {
  const t = utcMs(date);
  if (t === null) return null;
  const day = (new Date(t).getUTCDay() + 6) % 7; // Mon=0
  // Thursday of this ISO week decides the ISO year.
  const thu = new Date(t + (3 - day) * 86_400_000);
  const isoYear = thu.getUTCFullYear();
  const jan1 = Date.UTC(isoYear, 0, 1);
  const week = Math.floor((thu.getTime() - jan1) / (7 * 86_400_000)) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
