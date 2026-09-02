// Shared BFF helpers (design D4): JSON envelope, Zod fail-closed 400s,
// generic 500 that never leaks SQL internals.
import type { ZodType } from "zod";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function fail(error: string, field?: string, status = 400): Response {
  return json(field ? { error, field } : { error }, status);
}

export type Validated<T> = { ok: true; data: T } | { ok: false; res: Response };

/** Read + Zod-parse a JSON request body; fail closed with {error, field}. */
export async function readValidated<T>(req: Request, schema: ZodType<T>): Promise<Validated<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: fail("Invalid JSON body", "body") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue && issue.path.length > 0 ? issue.path.map(String).join(".") : undefined;
    return { ok: false, res: fail(issue ? issue.message : "Invalid input", field) };
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

/** Wrap a handler body so thrown DB errors become 500s. */
export async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return dbFailure(err);
  }
}
