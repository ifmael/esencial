// Paleta ⌘K dentro del Shell: abrir con el atajo, buscar, navegar con teclado,
// foco atrapado y devuelto. La API falsa responde recetas y ejercicios.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";

function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // La paleta solo necesita nombres: el resumen (una consulta) y no la
      // lista hidratada, que con 100 recetas tarda ~3 s en producción.
      if (url.includes("/api/recipes?summary=1"))
        return Response.json([{ id: 4, name: "Crema de calabaza" }]);
      if (url.includes("/api/recipes")) return Response.json([]);
      if (url.includes("/api/exercises"))
        return Response.json([
          { id: 9, name: "Press banca", tags: [], aliases: ["bench press"] },
        ]);
      if (url.includes("/api/templates")) return Response.json([]);
      return Response.json({});
    }),
  );
}

async function openApp(path = "/ui") {
  window.history.pushState({}, "", path);
  render(<App />);
  await screen.findAllByText("Deporte");
}

const pressK = () => fireEvent.keyDown(window, { key: "k", ctrlKey: true });

/** El campo de la paleta (/ui tiene otros combobox: los `<select>`). */
const paletteInput = async () =>
  within(await screen.findByRole("dialog", { name: /buscar/i })).getByRole(
    "combobox",
  );

describe("paleta de comandos", () => {
  beforeEach(() => {
    window.localStorage.clear();
    stubApi();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("Ctrl+K abre un diálogo con un combobox enfocado y su listbox", async () => {
    await openApp();
    pressK();
    const dialog = await screen.findByRole("dialog", { name: /buscar/i });
    const input = within(dialog).getByRole("combobox");
    expect(dialog.contains(input)).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(
      within(screen.getByRole("listbox", { name: "Resultados" })).getAllByRole(
        "option",
      ).length,
    ).toBeGreaterThan(3);
  });

  it("buscar una receta y Enter navega a su detalle y cierra", async () => {
    await openApp();
    pressK();
    const input = await paletteInput();
    fireEvent.change(input, { target: { value: "calab" } });
    const option = await screen.findByRole(
      "option",
      { name: /Crema de calabaza/ },
      { timeout: 3000 },
    );
    expect(option.getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(option.id);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(window.location.pathname).toBe("/recetario/4"));
    expect(screen.queryByRole("dialog", { name: /buscar/i })).toBeNull();
  });

  it("el alias encuentra el ejercicio (⌘K casa nombre, alias y grupos)", async () => {
    await openApp();
    pressK();
    const input = await paletteInput();
    fireEvent.change(input, { target: { value: "bench" } });
    const option = await screen.findByRole(
      "option",
      { name: /Press banca/ },
      { timeout: 3000 },
    );
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(window.location.pathname).toBe("/ejercicios/9"));
  });

  it("flechas mueven la opción activa dando la vuelta", async () => {
    await openApp();
    pressK();
    const input = await paletteInput();
    const options = within(
      screen.getByRole("listbox", { name: "Resultados" }),
    ).getAllByRole("option");
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(
      within(screen.getByRole("listbox", { name: "Resultados" }))
        .getAllByRole("option")
        .at(-1)
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(
      within(screen.getByRole("listbox", { name: "Resultados" }))
        .getAllByRole("option")[0]
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("Escape cierra y devuelve el foco a quien la abrió", async () => {
    await openApp();
    const trigger = screen.getAllByRole("button", { name: /buscar/i })[0];
    trigger.focus();
    fireEvent.click(trigger);
    const input = await paletteInput();
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /buscar/i })).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
  });

  it("Tab no saca el foco del diálogo", async () => {
    await openApp();
    pressK();
    const input = await paletteInput();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(document.activeElement).toBe(input);
  });

  it("tras cerrarla, navegar no roba el foco (se devuelve una sola vez)", async () => {
    await openApp();
    const trigger = screen.getAllByRole("button", { name: /buscar/i })[0];
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(await paletteInput(), { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    // El usuario sigue a lo suyo: enfoca otro control y navega. Ni el
    // re-render del Shell ni su nuevo montaje deben devolverle el foco al botón.
    const other = screen.getAllByRole("link", { name: "Ajustes" })[0];
    other.focus();
    fireEvent.click(screen.getAllByRole("link", { name: "Hoy" })[0]);
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(document.activeElement).not.toBe(trigger);
  });

  it("montar el Shell sin haber abierto la paleta no mueve el foco", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    await openApp();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("sin resultados lo anuncia en una región viva que ya existía", async () => {
    await openApp();
    pressK();
    const input = await paletteInput();
    const status = within(
      screen.getByRole("dialog", { name: /buscar/i }),
    ).getByRole("status");
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(status.textContent).toMatch(/sin resultados/i);
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("los resultados van en grupos con nombre", async () => {
    await openApp();
    pressK();
    await paletteInput();
    const listbox = screen.getByRole("listbox", { name: "Resultados" });
    expect(
      within(listbox).getByRole("group", { name: "Pantallas" }),
    ).toBeDefined();
    expect(
      within(listbox).getByRole("group", { name: "Acciones" }),
    ).toBeDefined();
  });

  it("«Cambiar tema» es una acción: cambia el tema sin navegar", async () => {
    await openApp();
    pressK();
    const input = await paletteInput();
    fireEvent.change(input, { target: { value: "tema" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(window.localStorage.getItem("esencial.theme")).toBe("light"),
    );
    expect(window.location.pathname).toBe("/ui");
    expect(window.location.hash).toBe("");
  });
});
