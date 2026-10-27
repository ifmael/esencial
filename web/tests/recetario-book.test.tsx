// E2 tasks 2.1–2.3: /recetario cards, loading/empty/error+retry, client search.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { makeRecipe, makeServer } from "./fixtures";
import {
  morphing,
  stubViewTransitions,
  unstubViewTransitions,
} from "./view-transition-stub";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  unstubViewTransitions();
});

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const three = [
  makeRecipe({ id: 1, name: "Arroz con pollo", tags: ["almuerzo"] }),
  makeRecipe({ id: 2, name: "Ensalada", tags: ["cena"] }),
  makeRecipe({ id: 3, name: "Gazpacho", photo_path: "recipe-g.png", tags: [] }),
];

describe("/recetario book", () => {
  it("shows loading then cards with names, tag chips and photo placeholder", async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((res) => (resolve = res));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return pending;
      }),
    );
    renderAt("/recetario");
    // La lista de recetas queda pendiente y el recetario enseña la carga.
    await screen.findByText("Cargando recetario…");

    resolve(new Response(JSON.stringify(three), { status: 200 }));
    await screen.findByText("Arroz con pollo");
    expect(screen.getByText("Ensalada")).toBeDefined();
    expect(screen.getByText("Gazpacho")).toBeDefined();
    expect(screen.getByText("almuerzo")).toBeDefined();
    // placeholder only for the recipe without a photo
    expect(screen.getAllByText("Sin foto").length).toBe(2);
    // DEF-6: photo_path llega como key cruda; el src debe llevar el prefijo /api/uploads/
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "/api/uploads/recipe-g.png",
    );
  });

  it("empty state invites creating the first recipe", async () => {
    vi.stubGlobal("fetch", makeServer([]).fetchMock);
    renderAt("/recetario");
    expect(
      await screen.findByText("Aún no hay recetas. ¡Crea la primera!"),
    ).toBeDefined();
  });

  it("«Nueva receta» se transforma en el formulario", async () => {
    vi.stubGlobal("fetch", makeServer(three).fetchMock);
    const before = stubViewTransitions();
    renderAt("/recetario");
    const button = await screen.findByRole("button", { name: "Nueva receta" });
    fireEvent.click(button);
    await waitFor(() => expect(before).toHaveLength(1));
    expect(before[0]).toEqual([button]);
    await screen.findByRole("heading", { name: "Nueva receta" });
    expect(morphing()).toHaveLength(1);
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
    const step = await screen.findByRole("listitem", { name: "paso 1" });
    expect(step.textContent).toBe("1. Sofreír");
  });
});

describe("/recetario — cuántas recetas coinciden", () => {
  const book = [
    makeRecipe({ id: 1, name: "Poke bowl básico", tags: [] }),
    makeRecipe({ id: 2, name: "Caldo básico de verduras", tags: [] }),
    makeRecipe({ id: 3, name: "Ensalada", tags: ["cena"] }),
  ];

  const search = async (value: string) =>
    fireEvent.change(
      await screen.findByRole("searchbox", { name: "Buscar recetas" }),
      { target: { value } },
    );

  /** Tarjetas de receta pintadas (la Destacada también es una tarjeta). */
  const cards = () =>
    [...document.querySelectorAll('a[href^="/recetario/"]')].filter((a) =>
      /^\/recetario\/\d+$/.test(a.getAttribute("href") ?? ""),
    ).length;

  it("sin búsqueda anuncia el total y la línea es una región viva", async () => {
    vi.stubGlobal("fetch", makeServer(book).fetchMock);
    renderAt("/recetario");
    const header = (
      await screen.findByRole("heading", { name: "Recetario" })
    ).closest("header") as HTMLElement;
    const line = await within(header).findByText("3 recetas");
    expect(line.getAttribute("aria-live")).toBe("polite");
    expect(cards()).toBe(3);
  });

  it("con búsqueda dice cuántas coinciden de cuántas, igual que las tarjetas", async () => {
    const server = makeServer(book);
    vi.stubGlobal("fetch", server.fetchMock);
    renderAt("/recetario");
    await screen.findByText("Poke bowl básico");
    const gets = server.calls.filter((c) => c.method === "GET").length;

    await search("basico");
    expect(screen.getByText("2 de 3")).toBeDefined();
    expect(cards()).toBe(2);
    expect(screen.getByText("Poke bowl básico")).toBeDefined();
    expect(screen.queryByText("Ensalada")).toBeNull();

    await search("BÁSICO");
    expect(screen.getByText("2 de 3")).toBeDefined();
    expect(cards()).toBe(2);

    await search("cena");
    expect(screen.getByText("1 de 3")).toBeDefined();
    expect(cards()).toBe(1);

    // Teclear y borrar no pide nada al servidor: sale de la lista en memoria.
    expect(server.calls.filter((c) => c.method === "GET").length).toBe(gets);
  });

  it("sin coincidencias deja «0 de N» y debajo el estado vacío de siempre", async () => {
    vi.stubGlobal("fetch", makeServer(book).fetchMock);
    renderAt("/recetario");
    await screen.findByText("Poke bowl básico");

    await search("pizza");
    expect(screen.getByText("0 de 3")).toBeDefined();
    expect(
      screen.getByText("Ninguna receta coincide con la búsqueda."),
    ).toBeDefined();
  });

  it("una búsqueda de solo espacios es como no buscar", async () => {
    vi.stubGlobal("fetch", makeServer(book).fetchMock);
    renderAt("/recetario");
    await screen.findByText("Poke bowl básico");

    await search("   ");
    expect(screen.getByText("3 recetas")).toBeDefined();
    expect(cards()).toBe(3);
  });

  it("una sola receta en el recetario se anuncia en singular", async () => {
    vi.stubGlobal(
      "fetch",
      makeServer([makeRecipe({ id: 1, name: "Gazpacho" })]).fetchMock,
    );
    renderAt("/recetario");
    expect(await screen.findByText("1 receta")).toBeDefined();
  });

  it("recetario vacío: la línea no se pinta", async () => {
    vi.stubGlobal("fetch", makeServer([]).fetchMock);
    renderAt("/recetario");
    await screen.findByText("Aún no hay recetas. ¡Crea la primera!");
    const header = screen
      .getByRole("heading", { name: "Recetario" })
      .closest("header") as HTMLElement;
    expect(within(header).queryByText(/^\d+ recetas?$/)).toBeNull();
    expect(within(header).queryByText(/^\d+ de \d+$/)).toBeNull();
  });
});
