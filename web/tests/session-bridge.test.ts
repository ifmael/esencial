import { describe, expect, it } from "vitest";

import { ensureApiSession } from "../src/lib/session-bridge";

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  };
}

function location(href = "https://web.example/plan-fuerza") {
  const assigned: string[] = [];
  return {
    href,
    assign: (url: string) => assigned.push(url),
    assigned,
  } as unknown as Location & { assigned: string[] };
}

const asFetch = (impl: () => Promise<unknown>) =>
  impl as unknown as typeof fetch;

describe("puente de sesión de la API", () => {
  it("deja montar la app si la API ya responde", async () => {
    const store = memory();
    const loc = location();
    const ready = await ensureApiSession({
      apiBase: "https://api.example",
      fetchImpl: asFetch(async () => ({ ok: true })),
      storage: store as unknown as Storage,
      location: loc,
    });
    expect(ready).toBe(true);
    expect(loc.assigned).toEqual([]);
  });

  it("manda al puente de la API si falta la cookie", async () => {
    const store = memory();
    const loc = location();
    const ready = await ensureApiSession({
      apiBase: "https://api.example",
      fetchImpl: asFetch(async () => ({ ok: false })),
      storage: store as unknown as Storage,
      location: loc,
    });
    expect(ready).toBe(false);
    expect(store.getItem("esencial.api-session")).toBe("1");
    expect(loc.assigned).toEqual([
      "https://api.example/api/session/return?to=https%3A%2F%2Fweb.example%2Fplan-fuerza",
    ]);
  });

  it("no entra en bucle si el puente ya se intentó", async () => {
    const store = memory();
    store.setItem("esencial.api-session", "1");
    const loc = location();
    const ready = await ensureApiSession({
      apiBase: "https://api.example",
      fetchImpl: asFetch(async () => {
        throw new Error("Access");
      }),
      storage: store as unknown as Storage,
      location: loc,
    });
    expect(ready).toBe(true);
    expect(loc.assigned).toEqual([]);
  });

  it("sin URL de API no hace nada", async () => {
    const loc = location();
    const ready = await ensureApiSession({
      apiBase: "",
      fetchImpl: asFetch(async () => {
        throw new Error("no debería llamarse");
      }),
      storage: memory() as unknown as Storage,
      location: loc,
    });
    expect(ready).toBe(true);
    expect(loc.assigned).toEqual([]);
  });
});
