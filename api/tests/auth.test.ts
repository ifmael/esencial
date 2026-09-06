// E7 tasks 2.1–2.5: login/logout/status endpoints + in-memory rate limit.
import { describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { Hono } from "hono";
import app from "../src/index";
import { authRoutes } from "../src/routes/auth";
import { createLoginLimiter } from "../src/rate-limit";
import { SESSION_COOKIE, verifyPassword } from "../src/auth";

const PASSWORD = "test-password-123";

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function loginAt(path: string, password: unknown, ip?: string) {
  return app.request(
    `http://localhost${path}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(ip ? { "CF-Connecting-IP": ip } : {}),
      },
      body: JSON.stringify({ password }),
    },
    env,
  );
}

/** App with injected limiter/clock (and optional verify spy) for DI tests. */
function isolated(opts: Parameters<typeof authRoutes>[0] = {}) {
  return new Hono<{ Bindings: typeof env }>().route(
    "/api/auth",
    authRoutes(opts),
  );
}

describe("POST /api/auth/login", () => {
  it("200 + HttpOnly/Secure/SameSite=Lax/Path=/ session cookie on correct password", async () => {
    const res = await app.request(
      "https://esencial.test/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: PASSWORD }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const raw = res.headers.get("set-cookie");
    expect(raw).toBeTruthy();
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Path=\//i);
    const [name, value] = (raw as string).split(";")[0].split("=");
    expect(name).toBe(SESSION_COOKIE);
    // Cookie value is `<exp_epoch>.<hmac>` — expiry ~30 days out.
    const exp = Number(decodeURIComponent(value).split(".")[0]);
    const days = (exp * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("Secure flag follows the request protocol: http → no Secure, https → Secure", async () => {
    const loginVia = (origin: string) =>
      app.request(
        `${origin}/api/auth/login`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password: PASSWORD }),
        },
        env,
      );
    const http = await loginVia("http://127.0.0.1:8787");
    expect(http.status).toBe(200);
    expect(http.headers.get("set-cookie")).not.toMatch(/Secure/i);

    const https = await loginVia("https://esencial.example");
    expect(https.status).toBe(200);
    expect(https.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("401 { error, field } + no cookie on wrong password", async () => {
    const res = await loginAt("/api/auth/login", "wrong-" + Math.random());
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await body(res)).toEqual({
      error: "Invalid credentials",
      field: "password",
    });
  });

  it("400 { error, field } on unparseable or schema-invalid body — hash never called", async () => {
    const bad = await app.request(
      "http://localhost/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      },
      env,
    );
    expect(bad.status).toBe(400);
    expect(Object.keys(await body(bad))).toEqual(["error", "field"]);

    const noPassword = await app.request(
      "http://localhost/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(noPassword.status).toBe(400);

    const verify = vi.fn(async () => false);
    const routes = isolated({ verify });
    const res = await routes.request(
      "http://localhost/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nope: 1 }),
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });

  it("fails closed (500) when secrets are missing — never an unsigned cookie", async () => {
    const res = await app.request(
      "http://localhost/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: PASSWORD }),
      },
      { ...env, AUTH_SECRET: undefined, PASSWORD_HASH: undefined },
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("POST /api/auth/logout + GET /api/auth/status", () => {
  it("status is 200 { authenticated: false|true } per cookie; tampered cookie is false", async () => {
    const anon = await app.request("http://localhost/api/auth/status", {}, env);
    expect(anon.status).toBe(200);
    expect(await body(anon)).toEqual({ authenticated: false });

    const login = await loginAt("/api/auth/login", PASSWORD);
    const cookie = (login.headers.get("set-cookie") as string).split(";")[0];
    const yes = await app.request(
      "http://localhost/api/auth/status",
      { headers: { cookie } },
      env,
    );
    expect(yes.status).toBe(200);
    expect(await body(yes)).toEqual({ authenticated: true });

    // flip one character inside the signed value
    const i = cookie.indexOf(".") + 1;
    const tamperedCookie =
      cookie.slice(0, i) +
      (cookie[i] === "1" ? "2" : "1") +
      cookie.slice(i + 1);
    const tampered = await app.request(
      "http://localhost/api/auth/status",
      { headers: { cookie: tamperedCookie } },
      env,
    );
    expect(tampered.status).toBe(200);
    expect(await body(tampered)).toEqual({ authenticated: false });
  });

  it("logout clears the cookie with Max-Age=0", async () => {
    const login = await loginAt("/api/auth/login", PASSWORD);
    const cookie = (login.headers.get("set-cookie") as string).split(";")[0];
    const res = await app.request(
      "http://localhost/api/auth/logout",
      { method: "POST", headers: { cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(SESSION_COOKIE);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
  });
});

describe("login rate limit (5 failures / 15 min per IP)", () => {
  function fromIp(
    a: ReturnType<typeof isolated>,
    password: string,
    ip?: string,
  ) {
    return a.request(
      "http://localhost/api/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(ip ? { "CF-Connecting-IP": ip } : {}),
        },
        body: JSON.stringify({ password }),
      },
      env,
    );
  }

  it("6th attempt is 429 even with the correct password; success resets; window reopens", async () => {
    let now = 1_000_000;
    const a = isolated({
      now: () => now,
      limiter: createLoginLimiter(() => now),
    });
    for (let i = 0; i < 5; i++)
      expect((await fromIp(a, "nope", "1.2.3.4")).status).toBe(401);

    const blocked = await fromIp(a, PASSWORD, "1.2.3.4");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("set-cookie")).toBeNull();
    expect(await body(blocked)).toEqual({
      error: "Too many attempts",
      field: "login",
    });

    // A different IP is unaffected.
    expect((await fromIp(a, PASSWORD, "9.9.9.9")).status).toBe(200);

    // Window elapses → counter gone even without a success.
    now += 15 * 60_000 + 1;
    expect((await fromIp(a, "nope", "1.2.3.4")).status).toBe(401);

    // 4 failures + correct attempt → success (threshold is EXCEEDED failures).
    const b = isolated({
      now: () => now,
      limiter: createLoginLimiter(() => now),
    });
    for (let i = 0; i < 4; i++)
      expect((await fromIp(b, "nope", "5.5.5.5")).status).toBe(401);
    expect((await fromIp(b, PASSWORD, "5.5.5.5")).status).toBe(200);
    // The success reset the counter: 4 more failures still pass.
    for (let i = 0; i < 4; i++)
      expect((await fromIp(b, "nope", "5.5.5.5")).status).toBe(401);
    expect((await fromIp(b, PASSWORD, "5.5.5.5")).status).toBe(200);
  });

  it("missing CF-Connecting-IP falls back to the shared 'unknown' bucket", async () => {
    const a = isolated({ limiter: createLoginLimiter() });
    for (let i = 0; i < 5; i++) expect((await fromIp(a, "x")).status).toBe(401);
    expect((await fromIp(a, PASSWORD)).status).toBe(429);
  });
});

describe("createLoginLimiter unit", () => {
  it("blocks at threshold, resets on success and after the window; prunes past 1000", () => {
    let now = 0;
    const l = createLoginLimiter(() => now);
    for (let i = 0; i < 5; i++) l.recordFailure("ip");
    expect(l.blocked("ip")).toBe(true);
    l.recordSuccess("ip");
    expect(l.blocked("ip")).toBe(false);
    for (let i = 0; i < 5; i++) l.recordFailure("ip");
    now += 15 * 60_000 + 1;
    expect(l.blocked("ip")).toBe(false);
    for (let i = 0; i < 1001; i++) l.recordFailure(`flood-${i}`);
    for (let i = 0; i < 1001; i++) l.recordFailure(`later-${i}`);
    expect(l.size()).toBeLessThanOrEqual(1002); // stale flood-* pruned
  });
});

// Wiring sanity: the digest shipped in wrangler.test.toml really verifies the
// password these tests log in with.
it("test env PASSWORD_HASH matches test-password-123", async () => {
  expect(await verifyPassword(env.PASSWORD_HASH as string, PASSWORD)).toBe(
    true,
  );
});
