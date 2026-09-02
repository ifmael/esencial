// E5 task 3.1: useDay — un fetch por fecha, descarte de respuestas superadas,
// error + reload.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDay, type DayData } from "../src/lib/day";

afterEach(() => vi.unstubAllGlobals());

function dayPayload(date: string): DayData {
  return {
    date,
    isoWeek: "2026-W36",
    dayIndex: 2,
    meals: [],
    session: null,
    note: { text: "" },
  };
}

describe("useDay", () => {
  it("hace una sola petición por fecha y expone data", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      Response.json(dayPayload(url.split("/").pop() as string)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useDay("2026-09-02"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/day/2026-09-02");
    expect(result.current.data?.date).toBe("2026-09-02");
    expect(result.current.error).toBeNull();
  });

  it("descarta la respuesta de una fecha ya superada", async () => {
    const gate = Promise.withResolvers<Response>();
    const fetchMock = vi.fn((url: string) =>
      url === "/api/day/2026-09-02"
        ? gate.promise
        : Promise.resolve(Response.json(dayPayload("2026-09-03"))),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ d }: { d: string }) => useDay(d), {
      initialProps: { d: "2026-09-02" },
    });
    rerender({ d: "2026-09-03" });
    await waitFor(() => expect(result.current.data?.date).toBe("2026-09-03"));
    // La respuesta vieja llega tarde: no debe pisar la fecha actual.
    gate.resolve(Response.json(dayPayload("2026-09-02")));
    await act(async () => {
      await gate.promise;
    });
    expect(result.current.data?.date).toBe("2026-09-03");
  });

  it("error de red → error; reload reintenta la misma fecha", async () => {
    let broken = true;
    const fetchMock = vi.fn(async () => {
      if (broken) throw new TypeError("network down");
      return Response.json(dayPayload("2026-09-02"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useDay("2026-09-02"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    broken = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data?.date).toBe("2026-09-02"));
    expect(result.current.error).toBeNull();
  });

  it("respuesta no-OK se reporta como error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const { result } = renderHook(() => useDay("2026-09-02"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});
