// useExercises / useTemplates hooks (E4 tasks 1.1 + 1.2) against mocked fetch.

import { act, renderHook, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExercises } from "../src/lib/exercises";
import { useIsDesktop } from "../src/lib/media";
import { useTemplates } from "../src/lib/templates";

type FetchMock = Mock<
  (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
>;

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): FetchMock {
  const fetchMock: FetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("useExercises", () => {
  it("loads the list from GET /api/exercises", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse([{ id: 1, name: "Sentadilla", tags: ["pierna"] }]),
    );
    const { result } = renderHook(() => useExercises());
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.exercises).toEqual([
      { id: 1, name: "Sentadilla", tags: ["pierna"] },
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/exercises", expect.anything());
  });

  it("creates via POST then refetches", async () => {
    const fetchMock = mockFetch((_url, init) =>
      init?.method === "POST"
        ? jsonResponse({ id: 2 }, 201)
        : jsonResponse([{ id: 1 }]),
    );
    const { result } = renderHook(() => useExercises());
    await waitFor(() => expect(result.current.pending).toBe(false));
    const created = await result.current.createExercise({
      name: "Remo",
      tags: ["espalda"],
    });
    expect(created).toEqual({ id: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/exercises",
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          (c) => String(c[0]) === "/api/exercises" && !c[1]?.method,
        ).length,
      ).toBe(2),
    );
  });

  it("exposes the 400 envelope {error, field} as a rejected ApiError", async () => {
    mockFetch(() =>
      jsonResponse({ error: "Already exists", field: "name" }, 400),
    );
    const { result } = renderHook(() => useExercises());
    await waitFor(() => expect(result.current.pending).toBe(false));
    await expect(
      result.current.createExercise({ name: "x", tags: ["t"] }),
    ).rejects.toMatchObject({
      message: "Already exists",
      field: "name",
      status: 400,
    });
  });

  it("updates via PUT with a refetch after", async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: 1 }));
    const { result } = renderHook(() => useExercises());
    await waitFor(() => expect(result.current.pending).toBe(false));
    await result.current.updateExercise(1, { name: "y", tags: ["t"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/exercises/1",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("surfaces load failure in error with retry", async () => {
    let ok = false;
    mockFetch(() => {
      if (ok) return jsonResponse([]);
      throw new TypeError("Network error");
    });
    const { result } = renderHook(() => useExercises());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.exercises).toEqual([]);
    ok = true;
    await act(async () => result.current.reload());
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});

describe("useTemplates", () => {
  it("loads templates in API order", async () => {
    mockFetch(() =>
      jsonResponse([
        { id: 1, name: "A — Empuje", rotationIndex: 0, exercises: [] },
        { id: 2, name: "B — Tirón", rotationIndex: 1, exercises: [] },
      ]),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.templates.map((t) => t.name)).toEqual([
      "A — Empuje",
      "B — Tirón",
    ]);
  });

  it("create/update/delete hit the right verbs and refetch", async () => {
    const fetchMock = mockFetch((_url, init) =>
      init?.method === "POST"
        ? jsonResponse({ id: 3 }, 201)
        : init?.method === "DELETE"
          ? new Response(null, { status: 204 })
          : jsonResponse([{ id: 3 }]),
    );
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.pending).toBe(false));
    await result.current.createTemplate({ name: "C", exercises: [] });
    await result.current.updateTemplate(3, { name: "C2", exercises: [] });
    await result.current.deleteTemplate(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/templates",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/templates/3",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/templates/3",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("useIsDesktop", () => {
  it("sigue al navegador al cambiar el ancho y suelta el listener al desmontar", () => {
    // `matchMedia` de mentira: la consulta responde lo que diga `mq.matches` y
    // avisa a quien escuche, como el navegador al redimensionar.
    const listeners = new Set<() => void>();
    const mq = {
      matches: false,
      media: "(min-width: 64rem)",
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
    vi.stubGlobal("matchMedia", () => mq);

    const { result, unmount } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);

    mq.matches = true;
    act(() => {
      for (const fn of listeners) fn();
    });
    expect(result.current).toBe(true);

    // Un listener que sobrevive al desmontaje se queda pegado a la ventana.
    unmount();
    expect(listeners.size).toBe(0);
  });
});
