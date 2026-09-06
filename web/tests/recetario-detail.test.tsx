// E2 task 3: /recetario/:id detail render, not-found, delete+confirm, pencil.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

const recipe = makeRecipe({ id: 7 });

describe("/recetario/:id", () => {
  it("renders description, servings, ordered ingredient checklist, numbered steps, materials, tags", async () => {
    vi.stubGlobal("fetch", makeServer([recipe]).fetchMock);
    renderAt("/recetario/7");
    expect(await screen.findByText("Arroz con pollo")).toBeDefined();
    expect(screen.getByText("Clásico de la abuela")).toBeDefined();
    expect(screen.getByText(/4 comensales/)).toBeDefined();

    const foods = (await screen.findAllByRole("checkbox")).map(
      (cb) => (cb.closest("li") as HTMLElement).textContent,
    );
    expect(foods[0]).toContain("arroz");
    expect(foods[0]).toContain("300");
    expect(foods[0]).toContain("g");
    expect(foods.map((f) => (f ?? "").includes("pollo"))).toEqual([
      false,
      true,
      false,
    ]);

    const steps = screen.getAllByRole("listitem", { name: /^paso \d/i });
    expect(steps.map((li) => li.textContent)).toEqual([
      "1. Sofreír",
      "2. Añadir arroz",
      "3. Cocer",
      "4. Servir",
    ]);
    expect(screen.getByText("olla")).toBeDefined();
    expect(screen.getByText("almuerzo")).toBeDefined();
  });

  it("unknown id shows not-found with a way back", async () => {
    vi.stubGlobal("fetch", makeServer([recipe]).fetchMock);
    renderAt("/recetario/999");
    expect(await screen.findByText("Receta no encontrada")).toBeDefined();
    fireEvent.click(screen.getByRole("link", { name: "Volver al recetario" }));
    await waitFor(() => expect(window.location.pathname).toBe("/recetario"));
  });

  it("delete: cancel changes nothing; confirm calls DELETE, shows success on the book", async () => {
    const server = makeServer([recipe]);
    vi.stubGlobal("fetch", server.fetchMock);
    renderAt("/recetario/7");
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
    expect(screen.getByText(/¿Seguro que quieres eliminar/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText(/¿Seguro/)).toBeNull();
    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar receta" }));
    await waitFor(() => expect(window.location.pathname).toBe("/recetario"));
    expect(
      server.calls.some(
        (c) => c.method === "DELETE" && c.url === "/api/recipes/7",
      ),
    ).toBe(true);
    expect(await screen.findByText("Receta eliminada")).toBeDefined();
    await waitFor(() =>
      expect(screen.queryByText("Arroz con pollo")).toBeNull(),
    );
  });

  it("pencil opens the editor pre-filled in edit mode", async () => {
    vi.stubGlobal("fetch", makeServer([recipe]).fetchMock);
    renderAt("/recetario/7");
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar receta" }),
    );
    const name = await screen.findByRole("textbox", { name: "Nombre" });
    expect((name as HTMLInputElement).value).toBe("Arroz con pollo");
    expect(
      (
        screen.getByRole("spinbutton", {
          name: "Comensales",
        }) as HTMLInputElement
      ).value,
    ).toBe("4");
    const ingredients = screen.getAllByRole("textbox", {
      name: /^Ingrediente \d+ alimento$/,
    });
    expect((ingredients[1] as HTMLInputElement).value).toBe("pollo");
  });
});
