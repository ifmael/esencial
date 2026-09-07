// Global test setup (web). The E7 GuardedShell calls /api/auth/status on mount;
// page tests stub fetch for their own endpoints only, so we wrap every stubbed
// fetch to answer the auth probe. If a test's own mock already answers the
// probe with an `authenticated` payload (e.g. auth-web), we honor it; otherwise
// we default to authenticated so page tests render past the guard.
import { vi } from "vitest";

function withAuthProbe(mock: unknown): unknown {
  if (typeof mock !== "function") return mock;
  const fn = mock as (...args: unknown[]) => Promise<Response>;
  return async (...args: unknown[]) => {
    const url = String(args[0]);
    if (!url.includes("/api/auth/status")) return fn(...args);
    try {
      const res = await fn(...args);
      const json = (await res.clone().json()) as Record<string, unknown> | null;
      if (json && "authenticated" in json) return res;
    } catch {
      /* mock not built for this URL — fall through */
    }
    return Response.json({ authenticated: true });
  };
}

const origStubGlobal = vi.stubGlobal;
vi.stubGlobal = ((key: string, value: unknown) =>
  origStubGlobal(
    key,
    key === "fetch" ? withAuthProbe(value) : value,
  )) as typeof vi.stubGlobal;
