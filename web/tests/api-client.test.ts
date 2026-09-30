// E6 task 2.1: typed fetch helper over the {error, field?} envelope.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetchRaw,
  apiGet,
  apiGetCached,
  apiSend,
} from "../src/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function jsonReply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiGet / apiSend", () => {
  it("returns parsed JSON on 2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonReply(200, [{ id: 1 }]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiGet("/api/plan-sessions")).resolves.toEqual([{ id: 1 }]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/plan-sessions");
  });

  it("POST sends JSON body and method", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonReply(201, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      apiSend("/api/workout-logs/2026-09-02", "POST", { effort: 3 }),
    ).resolves.toEqual({
      ok: true,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/workout-logs/2026-09-02");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ effort: 3 });
  });

  it("400 throws ApiError with error + field + status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonReply(400, { error: "Required", field: "sets.0.setIndex" }),
        ),
    );
    const err = (await apiSend("/api/x", "POST", {}).catch(
      (e) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.error).toBe("Required");
    expect(err.field).toBe("sets.0.setIndex");
  });

  it("409 throws ApiError without field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonReply(409, { error: "already logged" })),
    );
    const err = (await apiGet("/api/x").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.field).toBeUndefined();
  });

  it("network failure throws ApiError with status 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const err = (await apiGet("/api/x").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.error).toBeTruthy();
  });
});

describe("apiGetCached", () => {
  const stub = () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonReply(200, [{ id: 1 }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  /** Peticiones de lectura (sin método) que llegaron a la red. */
  const gets = (m: { mock: { calls: [string, RequestInit?][] } }) =>
    m.mock.calls.filter(([, init]) => !init?.method).length;

  it("una lista ya pedida no se vuelve a pedir (tampoco dos a la vez)", async () => {
    const fetchMock = stub();
    const [a, b] = await Promise.all([
      apiGetCached("/api/recipes"),
      apiGetCached("/api/recipes"),
    ]);
    await expect(apiGetCached("/api/recipes")).resolves.toEqual([{ id: 1 }]);
    expect(a).toEqual(b);
    expect(gets(fetchMock)).toBe(1);
    await apiGetCached("/api/exercises");
    expect(gets(fetchMock)).toBe(2);
  });

  it("pasados 5 minutos se vuelve a pedir", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetchMock = stub();
    await apiGetCached("/api/recipes");
    vi.advanceTimersByTime(5 * 60_000 - 1);
    await apiGetCached("/api/recipes");
    expect(gets(fetchMock)).toBe(1);
    vi.advanceTimersByTime(1);
    await apiGetCached("/api/recipes");
    expect(gets(fetchMock)).toBe(2);
  });

  it("cualquier escritura la vacía: lo siguiente se pide de nuevo", async () => {
    const fetchMock = stub();
    await apiGetCached("/api/recipes");
    await apiSend("/api/recipes", "POST", {});
    await apiGetCached("/api/recipes");
    expect(gets(fetchMock)).toBe(2);
    await apiFetchRaw("/api/recipes/1", { method: "DELETE" });
    await apiGetCached("/api/recipes");
    expect(gets(fetchMock)).toBe(3);
  });

  it("una lectura en vuelo durante una escritura no se reutiliza después", async () => {
    let release = (_: Response) => {};
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method
        ? jsonReply(201, {})
        : new Promise<Response>((r) => {
            release = r;
          }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const stale = apiGetCached("/api/recipes");
    await apiSend("/api/recipes", "POST", {});
    release(jsonReply(200, [{ id: "vieja" }]));
    await stale;
    const fresh = apiGetCached("/api/recipes");
    release(jsonReply(200, [{ id: "nueva" }]));
    await expect(fresh).resolves.toEqual([{ id: "nueva" }]);
  });

  it("un fallo no se guarda", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonReply(500, { error: "boom" }))
      .mockResolvedValue(jsonReply(200, []));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiGetCached("/api/recipes")).rejects.toBeInstanceOf(ApiError);
    await expect(apiGetCached("/api/recipes")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
