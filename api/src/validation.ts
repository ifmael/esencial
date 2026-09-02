// Body validation middleware: E1 readValidated ported verbatim (fail closed,
// first Zod issue → { error, field }; malformed JSON → field "body").
import { createMiddleware } from "hono/factory";
import type { ZodTypeAny, z } from "zod";
import { fail } from "./http";

export function zBody<S extends ZodTypeAny>(schema: S) {
  return createMiddleware<{ Variables: { validated: z.infer<S> } }>(async (c, next) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return fail("Invalid JSON body", "body");
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue && issue.path.length > 0 ? issue.path.map(String).join(".") : undefined;
      return fail(issue ? issue.message : "Invalid input", field);
    }
    c.set("validated", parsed.data);
    await next();
  });
}
