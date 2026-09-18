// usePlanWeek: sesiones de la semana ISO (id/date/name/status). El GET devuelve
// todas las sesiones; el hook filtra la semana en cliente. Las mutaciones del
// editor del día viven en la página, no en el hook.
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanWeek } from "../src/lib/plan-week";

type FetchMock = Mock<
  (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
>;

type PlanSession = {
  id: number;
  date: string;
  name: string | null;
  status: "planned" | "logged";
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

// Semana ISO 2026-W36 = lunes 2026-08-31 … domingo 2026-09-06 (2026-09-10 es W37).
const WEEK = "2026-W36";

let rows: PlanSession[] = [];
let getCalls = 0;
let failGet = false;

function handle(url: string, init?: RequestInit): Response {
  const method = init?.method ?? "GET";
  if (url.startsWith("/api/plan-sessions")) {
    if (method === "GET") {
      getCalls += 1;
      return failGet
        ? jsonResponse({ error: "boom" }, 500)
        : jsonResponse(rows);
    }
    if (method === "DELETE") {
      const match = /\/api\/plan-sessions\/(\d+)$/.exec(url);
      const id = match ? Number(match[1]) : NaN;
      const row = rows.find((r) => r.id === id);
      if (!row) return jsonResponse({ error: "Not found" }, 404);
      if (row.status === "logged")
        return jsonResponse({ error: "Sesión ya registrada" }, 409);
      rows = rows.filter((r) => r.id !== id);
      return jsonResponse({});
    }
  }
  return jsonResponse({ error: "not found" }, 404);
}

function mockFetch(): FetchMock {
  const fetchMock: FetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      handle(String(input), init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const planned = (id: number, date: string): PlanSession => ({
  id,
  date,
  name: "A — Empuje",
  status: "planned",
});
const logged = (id: number, date: string): PlanSession => ({
  id,
  date,
  name: "B — Tirón",
  status: "logged",
});

beforeEach(() => {
  rows = [planned(1, "2026-09-02"), logged(2, "2026-09-10")];
  getCalls = 0;
  failGet = false;
});

afterEach(() => vi.unstubAllGlobals());

describe("usePlanWeek", () => {
  it("carga las sesiones y filtra a la semana ISO pedida", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => usePlanWeek(WEEK));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessions).toEqual([planned(1, "2026-09-02")]);
    expect(result.current.error).toBeNull();
    expect(
      fetchMock.mock.calls.some(([u]) => String(u) === "/api/plan-sessions"),
    ).toBe(true);
  });

  it("name null se mantiene null (la UI pone el fallback)", async () => {
    mockFetch();
    rows = [{ id: 5, date: "2026-09-02", name: null, status: "planned" }];
    const { result } = renderHook(() => usePlanWeek(WEEK));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessions[0].name).toBeNull();
  });

  it("remove hace DELETE /api/plan-sessions/:id y recarga sin la sesión", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => usePlanWeek(WEEK));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.remove(1));
    expect(result.current.sessions).toEqual([]);
    expect(result.current.error).toBeNull();
    const del = fetchMock.mock.calls.find(([, i]) => i?.method === "DELETE");
    expect(del).toBeDefined();
    expect(String(del?.[0])).toBe("/api/plan-sessions/1");
    expect(getCalls).toBe(2); // carga inicial + recarga tras borrar
  });

  it("remove de logged (409): error 'Sesión ya registrada' y la sesión permanece", async () => {
    mockFetch();
    rows = [logged(3, "2026-09-02")];
    const { result } = renderHook(() => usePlanWeek(WEEK));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.remove(3));
    expect(result.current.error).toContain("Sesión ya registrada");
    expect(result.current.sessions).toEqual([logged(3, "2026-09-02")]);
  });

  it("fallo de GET → error; reload reintenta", async () => {
    mockFetch();
    failGet = true;
    const { result } = renderHook(() => usePlanWeek(WEEK));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.sessions).toEqual([]);
    failGet = false;
    await act(async () => result.current.reload());
    await waitFor(() =>
      expect(result.current.sessions).toEqual([planned(1, "2026-09-02")]),
    );
    expect(result.current.error).toBeNull();
  });
});
