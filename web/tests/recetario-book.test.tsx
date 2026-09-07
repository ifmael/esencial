// E2 tasks 2.1–2.3: /recetario cards, loading/empty/error+retry, client search.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { makeRecipe, makeServer } from "./fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const three = [
  makeRecipe({ id: 1, name: "Arroz con pollo", tags: ["almuerzo"] }),
  makeRecipe({ id: 2, name: "Ensalada", tags: ["cena"] }),
  makeRecipe({ id: 3, name: "Gazpacho", photo_path: "/fotos/g.png", tags: [] }),
];

describe("/recetario book", () => {
  it("shows loading then cards with names, tag chips and photo placeholder", async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((res) => (resolve = res));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/auth/status"))
          return new Response(JSON.stringify({ authenticated: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        return pending;
      }),
    );
    renderAt("/recetario");
    // Guard probe resolves first, then the book shows loading while /api/recipes pend.
    await screen.findByText("Cargando recetario…");

    resolve(new Response(JSON.stringify(three), { status: 200 }));
    await screen.findByText("Arroz con pollo");
    expect(screen.getByText("Ensalada")).toBeDefined();
    expect(screen.getByText("Gazpacho")).toBeDefined();
    expect(screen.getByText("almuerzo")).toBeDefined();
    // placeholder only for the recipe without a photo
    expect(screen.getAllByText("Sin foto").length).toBe(2);
  });

  it("empty state invites creating the first recipe", async () => {
    vi.stubGlobal("fetch", makeServer([]).fetchMock);
    renderAt("/recetario");
    expect(
      await screen.findByText("Aún no hay recetas. ¡Crea la primera!"),
    ).toBeDefined();
  });

  it("API error shows an error card with working retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderAt("/recetario");
    const retry = await screen.findByRole("button", { name: "Reintentar" });

    const server = makeServer(three);
    vi.stubGlobal("fetch", server.fetchMock);
    fireEvent.click(retry);
    await screen.findByText("Arroz con pollo");
  });

  it("search filters cards client-side without any fetch", async () => {
    const server = makeServer(three);
    vi.stubGlobal("fetch", server.fetchMock);
    renderAt("/recetario");
    await screen.findByText("Arroz con pollo");
    const gets = server.calls.filter((c) => c.method === "GET").length;

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar recetas" }),
      {
        target: { value: "arroz" },
      },
    );
    expect(screen.queryByText("Ensalada")).toBeNull();
    expect(screen.getByText("Arroz con pollo")).toBeDefined();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar recetas" }),
      {
        target: { value: "" },
      },
    );
    expect(screen.getByText("Ensalada")).toBeDefined();
    expect(server.calls.filter((c) => c.method === "GET").length).toBe(gets);
  });

  it("search matches by tag too", async () => {
    vi.stubGlobal("fetch", makeServer(three).fetchMock);
    renderAt("/recetario");
    await screen.findByText("Arroz con pollo");
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar recetas" }),
      {
        target: { value: "cena" },
      },
    );
    expect(screen.getByText("Ensalada")).toBeDefined();
    expect(screen.queryByText("Gazpacho")).toBeNull();
  });

  it("tapping a card navigates to the detail", async () => {
    vi.stubGlobal("fetch", makeServer(three).fetchMock);
    renderAt("/recetario");
    fireEvent.click(await screen.findByText("Arroz con pollo"));
    await waitFor(() => expect(window.location.pathname).toBe("/recetario/1"));
    expect(await screen.findByText("1. Sofreír")).toBeDefined();
  });
});
