// E2 task 4: editor create/edit flows, validation, dynamic rows, pending guard.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

async function openEditor() {
  renderAt("/recetario");
  fireEvent.click(await screen.findByRole("button", { name: "+ Nueva receta" }));
  return screen.findByRole("dialog", { name: "Nueva receta" });
}

describe("editor: create", () => {
  it("valid save POSTs payload, card appears, modal closes", async () => {
    const server = makeServer([]);
    vi.stubGlobal("fetch", server.fetchMock);
    await openEditor();

    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
      target: { value: "Tortilla" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Ingrediente 1 alimento" }), {
      target: { value: "huevo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir ingrediente" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Ingrediente 2 alimento" }), {
      target: { value: "patata" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Paso 1" }), {
      target: { value: "Batir" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const post = server.calls.find((c) => c.method === "POST");
    expect(post?.body?.name).toBe("Tortilla");
    expect((post?.body?.ingredients as { food: string }[]).map((i) => i.food)).toEqual([
      "huevo",
      "patata",
    ]);
    expect(post?.body?.steps).toEqual(["Batir"]);
    expect(await screen.findByText("Tortilla")).toBeDefined();
  });

  it("empty name: field error, zero API calls", async () => {
    const server = makeServer([]);
    vi.stubGlobal("fetch", server.fetchMock);
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("El nombre es obligatorio")).toBeDefined();
    expect(server.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("server 400 {error, field} renders beside the named field, data preserved", async () => {
    const server = makeServer([{ ...makeRecipe(), id: 5, name: "Existente" }]);
    vi.stubGlobal("fetch", server.fetchMock);
    await openEditor();
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
      target: { value: "Existente" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Ya existe")).toBeDefined();
    expect((screen.getByRole("textbox", { name: "Nombre" }) as HTMLInputElement).value).toBe(
      "Existente",
    );
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("cancel closes without any API call", async () => {
    const server = makeServer([]);
    vi.stubGlobal("fetch", server.fetchMock);
    await openEditor();
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
      target: { value: "Nada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(server.calls.some((c) => c.method !== "GET")).toBe(false);
  });

  it("submit disabled while saving (no duplicate POSTs)", async () => {
    let resolveSave!: (r: Response) => void;
    const save = new Promise<Response>((res) => (resolveSave = res));
    const base = makeServer([]).fetchMock;
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input) === "/api/recipes" && init?.method === "POST" ? save : base(input, init),
    );
    vi.stubGlobal("fetch", spy);
    await openEditor();
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
      target: { value: "Doble" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const btn = screen.getByRole("button", { name: /Guardando/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    fireEvent.click(btn);
    resolveSave(new Response("{}", { status: 201 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST").length).toBe(1);
  });
});

describe("editor: rows, chips, reorder", () => {
  it("add/remove ingredient rows; add/remove/reorder steps; material + tag chips", async () => {
    vi.stubGlobal("fetch", makeServer([]).fetchMock);
    await openEditor();

    // ingredient add + remove
    fireEvent.click(screen.getByRole("button", { name: "Añadir ingrediente" }));
    expect(screen.getAllByRole("textbox", { name: /^Ingrediente \d+ alimento$/ }).length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Quitar ingrediente 2" }));
    expect(screen.getAllByRole("textbox", { name: /^Ingrediente \d+ alimento$/ }).length).toBe(1);

    // steps: fill two, move first down, remove one
    fireEvent.change(screen.getByRole("textbox", { name: "Paso 1" }), { target: { value: "Uno" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir paso" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Paso 2" }), { target: { value: "Dos" } });
    fireEvent.click(screen.getByRole("button", { name: "Bajar paso 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Paso 1" }), { target: { value: "Dos" } });
    // after reorder both texts swapped: now "Uno" is in step 2
    fireEvent.click(screen.getByRole("button", { name: "Quitar paso 1" }));
    expect((screen.getByRole("textbox", { name: "Paso 1" }) as HTMLInputElement).value).toBe("Uno");

    // materials chips
    fireEvent.change(screen.getByRole("textbox", { name: "Nuevo material" }), {
      target: { value: "olla" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir material" }));
    expect(screen.getByText("olla")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Quitar material olla" }));
    expect(screen.queryByText("olla")).toBeNull();

    // free tags
    fireEvent.change(screen.getByRole("textbox", { name: "Nueva etiqueta" }), {
      target: { value: "batch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir etiqueta" }));
    expect(screen.getByText("batch")).toBeDefined();
  });
});

describe("editor: edit mode", () => {
  it("PUT replaces on save; cancel discards with zero writes", async () => {
    const recipe = makeRecipe({ id: 7 });
    const server = makeServer([recipe]);
    vi.stubGlobal("fetch", server.fetchMock);
    renderAt("/recetario/7");
    fireEvent.click(await screen.findByRole("button", { name: "Editar receta" }));
    await screen.findByRole("dialog", { name: "Editar receta" });

    // cancel: nothing sent, original intact
    fireEvent.change(screen.getByRole("textbox", { name: "Paso 1" }), {
      target: { value: "Tocado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(server.calls.some((c) => c.method === "PUT")).toBe(false);
    expect(screen.getByText("1. Sofreír")).toBeDefined();

    // save: PUT with edited name
    fireEvent.click(screen.getByRole("button", { name: "Editar receta" }));
    await screen.findByRole("dialog", { name: "Editar receta" });
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
      target: { value: "Arroz recaliente" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const call = server.calls.find((c) => c.method === "PUT");
    expect(call?.url).toBe("/api/recipes/7");
    expect(call?.body?.name).toBe("Arroz recaliente");
    await waitFor(() => expect(screen.findByText("Arroz recaliente")).toBeDefined());
  });
});
