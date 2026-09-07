// E7 design D5: in-process login rate limiter (per isolate, deliberate).
export interface LoginLimiter {
  blocked(ip: string): boolean;
  recordFailure(ip: string): void;
  recordSuccess(ip: string): void;
  size(): number;
}

export const LOGIN_FAIL_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_ENTRIES = 1000;

/**
 * ponytail: Map in-memory por isolate — se pierde en cold start y un atacante
 * distribuido por IP lo esquiva. Para un usuario personal con PBKDF2 es freno
 * de molestia, no muro. Upgrade path cuando duela: Durable Object singleton
 * (mismo interfaz `LoginLimiter`, ~30 líneas). No se hace hoy: DO añade
 * bindings, config y tests que el MVP no paga (design D5).
 */
export function createLoginLimiter(
  now: () => number = () => Date.now(),
  limit = LOGIN_FAIL_LIMIT,
  windowMs = LOGIN_WINDOW_MS,
): LoginLimiter {
  // Insertion-ordered Map doubles as the LRU for pruning.
  const hits = new Map<string, { count: number; resetAt: number }>();

  function liveEntry(ip: string) {
    const e = hits.get(ip);
    if (!e) return undefined;
    if (e.resetAt <= now()) {
      hits.delete(ip);
      return undefined;
    }
    return e;
  }

  return {
    blocked(ip) {
      const e = liveEntry(ip);
      return !!e && e.count >= limit;
    },
    recordFailure(ip) {
      const at = now();
      const e = hits.get(ip);
      if (e && e.resetAt > at) e.count += 1;
      else hits.set(ip, { count: 1, resetAt: at + windowMs });
      if (hits.size > MAX_ENTRIES) {
        // Prune expired first, then oldest-inserted (O(n) amortised on overflow only).
        for (const [k, v] of hits) {
          if (v.resetAt <= at) hits.delete(k);
        }
        while (hits.size > MAX_ENTRIES)
          hits.delete(hits.keys().next().value as string);
      }
    },
    recordSuccess(ip) {
      hits.delete(ip);
    },
    size() {
      return hits.size;
    },
  };
}
