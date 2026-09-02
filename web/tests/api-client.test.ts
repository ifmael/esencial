// E6 task 2.1: typed fetch helper over the {error, field?} envelope.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet, apiSend } from "../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

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
    await expect(apiSend("/api/workout-logs/2026-09-02", "POST", { effort: 3 })).resolves.toEqual({
      ok: true,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/workout-logs/2026-09-02");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ effort: 3 });
  });

  it("400 throws ApiError with error + field + status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonReply(400, { error: "Required", field: "sets.0.setIndex" })));
    const err = (await apiSend("/api/x", "POST", {}).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.error).toBe("Required");
    expect(err.field).toBe("sets.0.setIndex");
  });

  it("409 throws ApiError without field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonReply(409, { error: "already logged" })));
    const err = (await apiGet("/api/x").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.field).toBeUndefined();
  });

  it("network failure throws ApiError with status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = (await apiGet("/api/x").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.error).toBeTruthy();
  });
});
