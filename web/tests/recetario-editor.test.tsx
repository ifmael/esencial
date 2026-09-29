// E2 task 4 (revisado): el editor de receta es página propia —crear en
// /recetario/nueva y editar en /recetario/:id/editar—, como el de plantillas.
// La ficha se desmonta al entrar y no queda detrás (ya no hay modal); Cancelar
// y Escape vuelven sin llamadas a la API y Guardar manda un único POST (crear)
// o PUT (editar) con el borrador completo.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { makeRecipe, makeServer, type ServerCall } from "./fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const recipe = makeRecipe({ id: 7, photo_path: "recipe-7.png" });

const writes = (server: { calls: ServerCall[] }) =>
  server.calls.filter((c) => c.method !== "GET");

const value = (el: HTMLElement) => (el as HTMLInputElement).value;

describe("editor de receta: editar", () => {
  it("carga el borrador hidratado de la receta", async () => {
    vi.stubGlobal("fetch", makeServer([recipe]).fetchMock);
    renderAt("/recetario/7/editar");

    expect(
      await screen.findByRole("heading", { name: "Editar receta" }),
    ).toBeDefined();
    expect(value(screen.getByRole("textbox", { name: "Nombre" }))).toBe(
      "Arroz con pollo",
    );
    expect(value(screen.getByRole("textbox", { name: "Descripción" }))).toBe(
      "Clásico de la abuela",
    );
    expect(value(screen.getByRole("spinbutton", { name: "Comensales" }))).toBe(
      "4",
    );
    expect(
      value(screen.getByRole("textbox", { name: "Ingrediente 2 alimento" })),
    ).toBe("pollo");
    // La unidad es texto libre en la API: la que no está en el enum de la
    // página («g», «pechuga») se muestra tal cual, no como «—».
    expect(
      value(screen.getByRole("combobox", { name: "Ingrediente 1 unidad" })),
    ).toBe("g");
    expect(
      value(screen.getByRole("combobox", { name: "Ingrediente 2 unidad" })),
    ).toBe("pechuga");
    expect(value(screen.getByRole("textbox", { name: "Paso 1" }))).toBe(
      "Sofreír",
    );
    expect(
      screen.getByRole("button", { name: "Quitar material olla" }),
    ).toBeDefined();
    // La etiqueta de la receta llega elegida.
    expect(
      screen
        .getByRole("button", { name: "almuerzo" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    // Con su foto.
    expect(
      screen.getByAltText("Vista previa de la foto").getAttribute("src"),
    ).toBe("/api/uploads/recipe-7.png");
  });

  it("Cancelar y Escape vuelven a la ficha sin escribir nada", async () => {
    const server = makeServer([recipe]);
    vi.stubGlobal("fetch", server.fetchMock);
    renderAt("/recetario/7/editar");
    await screen.findByRole("heading", { name: "Editar receta" });

    fireEvent.change(screen.getByRole("textbox", { name: "Paso 1" }), {
      target: { value: "Tocado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(window.location.pathname).toBe("/recetario/7"));
    expect(writes(server)).toEqual([]);
    // La ficha sigue con los pasos originales.
    expect(
      (await screen.findByRole("listitem", { name: "paso 1" })).textContent,
    ).toBe("1. Sofreír");

    // Escape hace lo mismo que Cancelar.
    fireEvent.click(screen.getByRole("link", { name: "Editar receta" }));
    await screen.findByRole("heading", { name: "Editar receta" });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(window.location.pathname).toBe("/recetario/7"));
    expect(writes(server)).toEqual([]);
  });

  it("salir del editor no apila su URL: «atrás» desde la ficha no reabre el formulario", async () => {
    const server = makeServer([recipe]);
    vi.stubGlobal("fetch", server.fetchMock);
    renderAt("/recetario/7");
    fireEvent.click(await screen.findByRole("link", { name: "Editar receta" }));
    await screen.findByRole("heading", { name: "Editar receta" });

    // Cancelar reemplaza la entrada del editor por la de la ficha.
    const atEditor = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(window.location.pathname).toBe("/recetario/7"));
    expect(window.history.length).toBe(atEditor);

    // Guardar, igual: la entrada del editor no se queda detrás.
    fireEvent.click(await screen.findByRole("link", { name: "Editar receta" }));
    await screen.findByRole("heading", { name: "Editar receta" });
    const beforeSave = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(window.location.pathname).toBe("/recetario/7"));
    expect(window.history.length).toBe(beforeSave);
  });

  it("Guardar manda un único PUT con el borrador completo y vuelve a la ficha", async () => {
    const server = makeServer([recipe]);
    vi.stubGlobal("fetch", server.fetchMock);
    renderAt("/recetario/7/editar");
    await screen.findByRole("heading", { name: "Editar receta" });

    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
      target: { value: "Arroz recaliente" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Comensales" }), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Paso 1" }), {
      target: { value: "Sofreír con calma" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(window.location.pathname).toBe("/recetario/7"));
    const puts = server.calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toBe("/api/recipes/7");
    expect(puts[0].body).toEqual({
      name: "Arroz recaliente",
      description: "Clásico de la abuela",
      servings: 6,
      photo_path: "recipe-7.png",
      ingredients: [
        { food: "arroz", quantity: 300, unit: "g" },
        { food: "pollo", quantity: 2, unit: "pechuga" },
        { food: "ajo", quantity: 1, unit: "diente" },
      ],
      steps: ["Sofreír con calma", "Añadir arroz", "Cocer", "Servir"],
      materials: ["olla", "sartén"],
      tags: ["almuerzo"],
    });
    // La ficha vuelve con el nombre nuevo.
    expect(
      await screen.findByRole("heading", { name: "Arroz recaliente" }),
    ).toBeDefined();
  });

  it("nombre vacío: error local junto al campo y cero escrituras", async () => {
    const server = makeServer([recipe]);
    vi.stubGlobal("fetch", server.fetchMock);
    renderAt("/recetario/7/editar");
    await screen.findByRole("heading", { name: "Editar receta" });

    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El nombre es obligatorio")).toBeDefined();
    expect(writes(server)).toEqual([]);
    expect(window.location.pathname).toBe("/recetario/7/editar");
  });

  it("id desconocido: vuelve al recetario", async () => {
    vi.stubGlobal("fetch", makeServer([recipe]).fetchMock);
    renderAt("/recetario/999/editar");
    await waitFor(() => expect(window.location.pathname).toBe("/recetario"));
  });

  it("foto nueva en edición: Guardar la sube y el PUT lleva la key", async () => {
    const server = makeServer([makeRecipe({ id: 7, photo_path: null })]);
    vi.stubGlobal("fetch", server.fetchMock);
    renderAt("/recetario/7/editar");
    await screen.findByRole("heading", { name: "Editar receta" });

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, {
      target: {
        files: [new File(["foto"], "nueva.png", { type: "image/png" })],
      },
    });
    await screen.findByAltText("Vista previa de la foto");

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(window.location.pathname).toBe("/recetario/7"));
    const put = server.calls.find((c) => c.method === "PUT");
    expect(
      (put?.body as Record<string, unknown> | undefined)?.photo_path,
    ).toMatch(/^recipe-\d+\.png$/);
  });
});
