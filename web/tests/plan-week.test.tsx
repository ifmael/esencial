// usePlanWeek: sesiones de la semana ISO (id/date/name/status). El GET devuelve
// todas las sesiones; el hook filtra la semana en cliente. Las mutaciones del
// editor del día viven en la página, no en el hook.
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  planItems,
  recreatePayload,
  type SessionExercise,
  usePlanWeek,
} from "../src/lib/plan-week";

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

  it("streak cuenta las semanas seguidas con sesión registrada sobre TODO el GET, no solo la semana vista", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 3, 12)); // jueves de 2026-W36
    try {
      mockFetch();
      rows = [
        planned(1, "2026-09-02"), // W36: aún sin registrar, no corta la racha
        logged(2, "2026-08-26"), // W35
        logged(3, "2026-08-19"), // W34
        logged(4, "2026-08-05"), // W32: tras el hueco de W33, no cuenta
      ];
      // Se mira otra semana: su filtro sale vacío y la racha no cambia.
      const { result } = renderHook(() => usePlanWeek("2026-W40"));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.sessions).toEqual([]);
      expect(result.current.streak).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("planItems", () => {
  const exercise = (
    over: Partial<SessionExercise> & { id: number; position: number },
  ): SessionExercise => ({
    exerciseId: over.id - 100,
    exerciseName: "X",
    kind: "strength",
    targetSets: 3,
    targetRepsMin: 8,
    targetRepsMax: 10,
    targetDistanceKm: null,
    targetDurationMin: null,
    ...over,
    restSecs: over.restSecs ?? null,
    restAfterSecs: over.restAfterSecs ?? null,
  });

  it("sobreescribe las series del borrador y conserva el resto de objetivos", () => {
    expect(
      planItems(
        [
          exercise({ id: 101, position: 0 }),
          exercise({
            id: 102,
            position: 1,
            kind: "running",
            targetSets: null,
            targetRepsMin: null,
            targetRepsMax: null,
            targetDistanceKm: 5,
            targetDurationMin: 30,
          }),
        ],
        new Map([[101, 5]]),
      ),
    ).toEqual([
      {
        exerciseId: 1,
        targetSets: 5,
        targetRepsMin: 8,
        targetRepsMax: 10,
        targetDistanceKm: null,
        targetDurationMin: null,
        restSecs: null,
        restAfterSecs: null,
      },
      {
        exerciseId: 2,
        targetSets: null,
        targetRepsMin: null,
        targetRepsMax: null,
        targetDistanceKm: 5,
        targetDurationMin: 30,
        restSecs: null,
        restAfterSecs: null,
      },
    ]);
  });

  it("respeta el orden recibido, no la posición de cada item", () => {
    expect(
      planItems(
        [
          exercise({ id: 101, position: 1 }),
          exercise({ id: 102, position: 0 }),
        ],
        new Map(),
      ).map((i) => i.exerciseId),
    ).toEqual([1, 2]);
  });
});

describe("recreatePayload", () => {
  it("rehace el POST de una sesión desprogramada: fecha, nombre y los items en orden con sus objetivos", () => {
    const ex = (exerciseId: number, position: number) => ({
      id: 100 + exerciseId,
      exerciseId,
      exerciseName: `E${exerciseId}`,
      kind: "strength" as const,
      position,
      targetSets: exerciseId === 10 ? null : 3,
      targetRepsMin: null,
      targetRepsMax: 12,
      targetDistanceKm: exerciseId === 10 ? 5 : null,
      targetDurationMin: exerciseId === 10 ? 30 : null,
      restSecs: null,
      restAfterSecs: null,
    });
    expect(
      recreatePayload({
        id: 4,
        date: "2026-09-01",
        name: null,
        status: "planned",
        exercises: [ex(10, 0), ex(7, 1)],
      }),
    ).toEqual({
      date: "2026-09-01",
      name: null,
      items: [
        {
          exerciseId: 10,
          targetSets: null,
          targetRepsMin: null,
          targetRepsMax: 12,
          targetDistanceKm: 5,
          targetDurationMin: 30,
          restSecs: null,
          restAfterSecs: null,
        },
        {
          exerciseId: 7,
          targetSets: 3,
          targetRepsMin: null,
          targetRepsMax: 12,
          targetDistanceKm: null,
          targetDurationMin: null,
          restSecs: null,
          restAfterSecs: null,
        },
      ],
    });
  });
});
