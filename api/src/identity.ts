// Identidad del usuario: la prueba Cloudflare Access en el borde, así que la
// API solo lee el email ya autenticado. Hay dos seams, y son distintos:
//   * `ctx.access` — producción, y también `pnpm dev` vía `[access.dev]` de
//     wrangler, que inyecta una identidad fija. Sirve para una sola persona.
//   * `X-Dev-Email` con `DEV_AUTH=1` — solo dev/e2e: varias identidades en la
//     misma corrida, que es lo que necesitan aislamiento y familia. Sin el flag
//     la cabecera se ignora.
// Todo lo demás falla cerrado: sin un email con forma válida no hay identidad.
import type { Context } from "hono";
import type { AppContext } from "./db";

export const DEV_EMAIL_HEADER = "x-dev-email";

/** Forma mínima de un email. Que Access lo haya probado no se ve aquí; esto
 *  solo descarta basura antes de tocar la base. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email normalizado (minúsculas, sin espacios) o null. `users.email` es UNIQUE,
 *  así que la forma se decide una sola vez: aquí y antes de insertar. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return EMAIL.test(email) ? email : null;
}

/** Lo que el runtime expone en `ctx.access` (`CloudflareAccessContext`). */
type AccessContext = {
  getIdentity?: () => Promise<{ email?: string | null } | null>;
};

export type IdentitySource = {
  /** `ctx.access` del Worker (producción y `[access.dev]`). */
  access?: unknown;
  /** `env.DEV_AUTH`: la cabecera de dev solo se honra con "1". */
  devAuth?: string;
  devEmail?: string;
};

/** Email de la petición, o null si no hay identidad fiable (fail closed). El
 *  seam de dev manda cuando está encendido: en e2e no hay Access delante. */
export async function identityEmail(
  source: IdentitySource,
): Promise<string | null> {
  if (source.devAuth === "1") return normalizeEmail(source.devEmail);
  const access = source.access as AccessContext | undefined;
  if (!access?.getIdentity) return null;
  return normalizeEmail((await access.getIdentity())?.email);
}

/** `ctx.access` si el Worker lo tiene, es decir si quien autenticó la petición
 *  fue Cloudflare Access. En los tests no hay ExecutionContext y `c.executionCtx`
 *  lanza, así que la lectura va protegida. */
export function accessContext(c: Context<AppContext>): unknown {
  try {
    return (c.executionCtx as { access?: unknown } | undefined)?.access;
  } catch {
    return undefined;
  }
}

/** Email de una petición Hono, leyendo la identidad del ExecutionContext. En
 *  los tests no hay ExecutionContext (Hono pone uno por defecto, sin `access`). */
export async function requestIdentity(
  c: Context<AppContext>,
): Promise<string | null> {
  return identityEmail({
    access: accessContext(c),
    devAuth: c.env.DEV_AUTH,
    devEmail: c.req.header(DEV_EMAIL_HEADER),
  });
}
