// E7 auth endpoints: POST /login, POST /logout, GET /status (spec: signed
// stateless session via Hono setSignedCookie; the E1 { error, field? }
// envelope everywhere else). Handlers sit behind a factory so tests inject
// limiter/clock/verify (DI seam).
import { Hono } from "hono";
import { deleteCookie, getCookie, setSignedCookie } from "hono/cookie";
import {
  readSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  verifyPassword,
} from "../auth";
import type { Env } from "../db";
import { fail, json } from "../http";
import { createLoginLimiter, type LoginLimiter } from "../rate-limit";

// Flags required by the spec: HttpOnly; Secure; SameSite=Lax; Path=/.
// `secure` follows the request protocol: https in production keeps Secure;
// plain-http consumers (wrangler dev on 127.0.0.1, non-browser HTTP clients)
// get a cookie their cookie jars actually store — browsers treat http://127.0.0.1
// as trustworthy either way.
const cookieOpts = (secure: boolean) => ({
  path: "/",
  httpOnly: true,
  secure,
  sameSite: "Lax" as const,
  maxAge: SESSION_MAX_AGE_S,
});

export interface AuthDeps {
  limiter?: LoginLimiter;
  now?: () => number;
  verify?: (digest: string, password: string) => Promise<boolean>;
  secret?: string | undefined;
  digest?: string | undefined;
}

/** Module-level limiter = per-isolate counter (design D5). */
const sharedLimiter = createLoginLimiter();

export function authRoutes(deps: AuthDeps = {}) {
  const limiter = deps.limiter ?? sharedLimiter;
  const now = deps.now ?? (() => Date.now());
  const verify = deps.verify ?? verifyPassword;

  return new Hono<{ Bindings: Env }>()
    .post("/login", async (c) => {
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return fail("Invalid JSON body", "body");
      }
      const password =
        raw !== null &&
        typeof raw === "object" &&
        "password" in raw &&
        typeof raw.password === "string"
          ? raw.password
          : undefined;
      if (password === undefined || password.length === 0)
        return fail("Password is required", "password");

      const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
      if (limiter.blocked(ip)) return fail("Too many attempts", "login", 429);

      const secret = deps.secret ?? c.env.AUTH_SECRET;
      const digest = deps.digest ?? c.env.PASSWORD_HASH;
      if (!secret || !digest) {
        // Fail closed: never issue an unsigned/insecure cookie (spec scenario).
        return json({ error: "Internal server error" }, 500);
      }

      if (!(await verify(digest, password))) {
        limiter.recordFailure(ip);
        return fail("Invalid credentials", "password", 401);
      }
      limiter.recordSuccess(ip);

      const exp = Math.floor(now() / 1000) + SESSION_MAX_AGE_S;
      await setSignedCookie(
        c,
        SESSION_COOKIE,
        String(exp),
        secret,
        cookieOpts(new URL(c.req.url).protocol === "https:"),
      );
      return c.json({ ok: true });
    })
    .post("/logout", (c) => {
      deleteCookie(c, SESSION_COOKIE, {
        path: "/",
        secure: true,
        sameSite: "Lax",
      });
      return c.json({ ok: true });
    })
    .get("/status", async (c) => {
      const secret = deps.secret ?? c.env.AUTH_SECRET;
      // getCookie (not getSignedCookie): readSessionToken verifies the raw
      // `<exp>.<sig>` value itself; getSignedCookie would strip the signature
      // before we could read the expiry.
      const raw = secret ? getCookie(c, SESSION_COOKIE) : undefined;
      const session = secret ? await readSessionToken(secret, raw) : null;
      return c.json({ authenticated: session !== null });
    });
}
