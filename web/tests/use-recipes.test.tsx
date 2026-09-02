// E2 task 1.2: useRecipes — list on mount, mutate + refresh, saving flag,
// {error, field} captured.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRecipes } from "../src/components/recipes/use-recipes";
import { makeRecipe, makeServer } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("useRecipes", () => {
  it("loads the list on mount", async () => {
    const { fetchMock } = makeServer([makeRecipe()]);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useRecipes());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.list.map((r) => r.name)).toEqual(["Arroz con pollo"]);
    expect(result.current.error).toBeNull();
  });

  it("captures network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const { result } = renderHook(() => useRecipes());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.list).toEqual([]);
  });

  it("create posts, refreshes, exposes saving and the server field error", async () => {
    const server = makeServer([]);
    vi.stubGlobal("fetch", server.fetchMock);
    const { result } = renderHook(() => useRecipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.create({ name: "Existente" });
    });
    expect(result.current.fieldError).toEqual({ field: "name", message: "Ya existe" });
    expect(server.calls.some((c) => c.method === "POST" && c.url === "/api/recipes")).toBe(true);

    await act(async () => {
      ok = await result.current.create({ name: "Nuevo", tags: ["x"] });
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.list.map((r) => r.name)).toEqual(["Nuevo"]));
  });

  it("update puts by id; remove deletes and refreshes", async () => {
    const r = makeRecipe({ id: 7, name: "Viejo" });
    const server = makeServer([r]);
    vi.stubGlobal("fetch", server.fetchMock);
    const { result } = renderHook(() => useRecipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.update(7, { name: "Nuevo nombre" });
    });
    expect(server.calls.some((c) => c.method === "PUT" && c.url === "/api/recipes/7")).toBe(true);

    await act(async () => {
      await result.current.remove(7);
    });
    expect(server.calls.some((c) => c.method === "DELETE" && c.url === "/api/recipes/7")).toBe(true);
    await waitFor(() => expect(result.current.list).toEqual([]));
  });

  it("retry refetches after an error", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", failing);
    const { result } = renderHook(() => useRecipes());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    const server = makeServer([makeRecipe()]);
    vi.stubGlobal("fetch", server.fetchMock);
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.list.length).toBe(1));
    expect(result.current.error).toBeNull();
  });
});
