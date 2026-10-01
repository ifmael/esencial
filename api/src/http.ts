// Shared API helpers (E1 lib/api.ts ported): JSON envelope, Zod fail-closed 400s,
// generic 500 that never leaks SQL internals.
import type { ZodType } from "zod";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** `json` plus a Set-Cookie header (Hono's setCookie is lost on returned Responses). */
export function jsonWithCookie(
  data: unknown,
  cookie: string,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "set-cookie": cookie },
  });
}

export function fail(error: string, field?: string, status = 400): Response {
  return json(field ? { error, field } : { error }, status);
}

export type Validated<T> = { ok: true; data: T } | { ok: false; res: Response };

/** Read + Zod-parse a JSON request body; fail closed with {error, field}. */
export async function readValidated<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<Validated<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: fail("Invalid JSON body", "body") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field =
      issue && issue.path.length > 0
        ? issue.path.map(String).join(".")
        : undefined;
    return {
      ok: false,
      res: fail(issue ? issue.message : "Invalid input", field),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Map an unexpected DB failure to a safe response (UNIQUE violations → 400). */
export function dbFailure(err: unknown): Response {
  const message = err instanceof Error ? err.message : "";
  const m = /UNIQUE constraint failed: \w+\.(\w+)/.exec(message);
  if (m) return fail(`Already exists`, m[1]);
  if (/FOREIGN KEY constraint failed/.test(message))
    return fail("References a missing or in-use record", "reference");
  return json({ error: "Internal server error" }, 500);
}

/** Parse a numeric path param; null when invalid. */
export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const DATE_STR = /^\d{4}-\d{2}-\d{2}$/;

/** Página de los índices del histórico: 20 filas por defecto, hasta 60.
 *  `before` es exclusivo (la última fecha ya vista); `from`/`to` son el rango
 *  pedido por el usuario, con los dos extremos incluidos. */
export const HISTORY_PAGE = 20;
export const HISTORY_MAX = 60;
export type Cursor = {
  before: string | null;
  limit: number;
  from: string | null;
  to: string | null;
};

/** `?before=&from=&to=YYYY-MM-DD&limit=1-60` → cursor, o la respuesta 400. */
export function readCursor(
  query: (key: string) => string | undefined,
): Cursor | Response {
  const dates: Record<"before" | "from" | "to", string | null> = {
    before: null,
    from: null,
    to: null,
  };
  for (const key of ["before", "from", "to"] as const) {
    const value = query(key);
    if (value !== undefined && !DATE_STR.test(value))
      return fail(`${key} must be YYYY-MM-DD`, key);
    dates[key] = value ?? null;
  }
  if (dates.from !== null && dates.to !== null && dates.from > dates.to)
    return fail("to must not be before from", "to");
  const raw = query("limit") ?? String(HISTORY_PAGE);
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > HISTORY_MAX)
    return fail(`limit must be 1-${HISTORY_MAX}`, "limit");
  return { ...dates, limit: Number(raw) };
}

/** Condiciones de fecha del histórico y **sus argumentos en el mismo orden**
 *  (los huecos del SQL se cuentan en el orden en que se empalman). */
export function dateFilter(cursor: Cursor): {
  conditions: string[];
  args: string[];
} {
  const conditions: string[] = [];
  const args: string[] = [];
  const add = (sql: string, value: string | null) => {
    if (value === null) return;
    conditions.push(sql);
    args.push(value);
  };
  add("wl.date < ?", cursor.before);
  add("wl.date >= ?", cursor.from);
  add("wl.date <= ?", cursor.to);
  return { conditions, args };
}

/** Wrap a handler body so thrown D1 errors become safe responses (E1 guard). */
export async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return dbFailure(err);
  }
}
