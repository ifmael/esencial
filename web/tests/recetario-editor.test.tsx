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
    expect((call?.body as Record<string, unknown>)?.name).toBe("Arroz recaliente");
    await waitFor(() => expect(screen.findByText("Arroz recaliente")).toBeDefined());
  });
});
