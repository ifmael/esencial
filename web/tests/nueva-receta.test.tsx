// E8 nueva-receta: página propia para crear recetas. Upload con contrato
// fail-closed: POST /api/uploads -> 200 {photo_path}; 400 {error, field:"file"}.
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

async function openPage() {
  renderAt("/recetario/nueva");
  await screen.findByRole("heading", { name: "Nueva receta" });
}

const fileOf = (name: string, type = "image/png") => new File(["foto"], name, { type });

describe("nueva-receta: render", () => {
  it("renderiza secciones y chips base", async () => {
    vi.stubGlobal("fetch", makeServer([]).fetchMock);
    await openPage();

    expect(screen.getByRole("heading", { name: "Nueva receta" })).toBeDefined();
    for (const s of ["Foto principal", "Nombre", "Categorías", "Materiales", "Ingredientes", "Pasos"]) {
      expect(screen.getByText(s)).toBeDefined();
    }
    for (const c of ["Desayuno", "Almuerzo", "Cena", "Snack"]) {
      expect(screen.getByRole("button", { name: c })).toBeDefined();
    }
  });
});

describe("nueva-receta: categorías", () => {
  it("toggle de chips base y añadir custom", async () => {
    const server = makeServer([]);
    vi.stubGlobal("fetch", server.fetchMock);
    await openPage();

    fireEvent.click(screen.getByRole("button", { name: "Desayuno" }));
    expect(screen.getByRole("button", { name: "Desayuno" }).className).toContain("bg-primary-container");

    fireEvent.change(screen.getByRole("textbox", { name: "Nueva categoría" }), {
      target: { value: "batch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir categoría" }));
    expect(screen.getByRole("button", { name: "batch" })).toBeDefined();
    expect((screen.getByRole("textbox", { name: "Nueva categoría" }) as HTMLInputElement).value).toBe("");
  });
});

describe("nueva-receta: filas", () => {
  it("ingredientes: añadir/eliminar fila con cantidad number y select unidad", async () => {
    vi.stubGlobal("fetch", makeServer([]).fetchMock);
    await openPage();

    fireEvent.click(screen.getByRole("button", { name: "Añadir ingrediente" }));
    expect(screen.getAllByRole("textbox", { name: /^Ingrediente \d+ alimento$/ }).length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Quitar ingrediente 2" }));
    expect(screen.getAllByRole("textbox", { name: /^Ingrediente \d+ alimento$/ }).length).toBe(1);

    // cantidad number y unidad select gr|ml|ud
    fireEvent.change(screen.getByRole("spinbutton", { name: "Ingrediente 1 cantidad" }), {
      target: { value: "300" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Ingrediente 1 unidad" }), {
      target: { value: "gr" },
    });
    expect(
      (screen.getByRole("combobox", { name: "Ingrediente 1 unidad" }) as HTMLSelectElement).value,
    ).toBe("gr");
  });

  it("pasos: añadir/eliminar numerados", async () => {
    vi.stubGlobal("fetch", makeServer([]).fetchMock);
    await openPage();

    fireEvent.change(screen.getByRole("textbox", { name: "Paso 1" }), { target: { value: "Batir" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir paso" }));
    expect(screen.getAllByRole("textbox", { name: /^Paso \d+$/ }).length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Quitar paso 2" }));
    expect(screen.getAllByRole("textbox", { name: /^Paso \d+$/ }).length).toBe(1);
  });

  it("materiales: añadir/eliminar chip", async () => {
    vi.stubGlobal("fetch", makeServer([]).fetchMock);
    await openPage();

    fireEvent.change(screen.getByRole("textbox", { name: "Nuevo material" }), {
      target: { value: "olla" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir material" }));
    expect(screen.getByText("olla")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Quitar material olla" }));
    expect(screen.queryByText("olla")).toBeNull();
  });
});

describe("nueva-receta: guardado", () => {
  it("nombre vacío: error local, cero llamadas", async () => {
    const server = makeServer([]);
    vi.stubGlobal("fetch", server.fetchMock);
    await openPage();

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("El nombre es obligatorio")).toBeDefined();
    expect(server.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("guardar POSTea payload correcto y navega a /recetario", async () => {
    const server = makeServer([]);
    vi.stubGlobal("fetch", server.fetchMock);
    await openPage();

    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), { target: { value: "Tortilla" } });
    fireEvent.click(screen.getByRole("button", { name: "Desayuno" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Ingrediente 1 alimento" }), {
      target: { value: "huevo" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Ingrediente 1 cantidad" }), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Ingrediente 1 unidad" }), {
      target: { value: "ud" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Paso 1" }), { target: { value: "Batir" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Nuevo material" }), {
      target: { value: "sartén" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir material" }));

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(server.calls.some((c) => c.method === "POST" && c.url === "/api/recipes")).toBe(true));
    await screen.findByRole("heading", { name: "Recetario" });
    const post = server.calls.find((c) => c.method === "POST" && c.url === "/api/recipes");
    expect(post?.body).toMatchObject({
      name: "Tortilla",
      description: null,
      servings: null,
      photo_path: null,
      tags: ["Desayuno"],
      materials: ["sartén"],
      ingredients: [{ food: "huevo", quantity: 3, unit: "ud" }],
      steps: ["Batir"],
    });
  });
});

describe("nueva-receta: subida de foto", () => {
  it("seleccion de archivo POSTea /api/uploads y muestra preview", async () => {
    const server = makeServer([]);
    vi.stubGlobal("fetch", server.fetchMock);
    await openPage();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { files: [fileOf("foto.png")] } });

    await waitFor(() =>
      expect(server.calls.some((c) => c.method === "POST" && c.url === "/api/uploads")).toBe(true),
    );
    const call = server.calls.find((c) => c.url === "/api/uploads");
    expect(call?.body).toBeInstanceOf(FormData);
    expect(await (call?.body as FormData).get("file")).toBeInstanceOf(File);
    const img = await screen.findByAltText("Vista previa de la foto");
    expect(img.getAttribute("src")).toBe("/api/uploads/recipe-100.png");
  });

  it("fallo de subida muestra alerta de error", async () => {
    const stubbed = makeServer([]);
    vi.stubGlobal("fetch", stubbed.fetchMock);
    await openPage();

    stubbed.server.nextUploadFails = true;
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOf("grande.png")] } });

    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.queryByRole("img", { name: "Vista previa de la foto" })).toBeNull();
  });

  it("tras fallo de subida, Guardar reintenta la subida antes de crear (re-review 6)", async () => {
    const stubbed = makeServer([]);
    vi.stubGlobal("fetch", stubbed.fetchMock);
    await openPage();

    stubbed.server.nextUploadFails = true;
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOf("reintento.png")] } });
    await screen.findByRole("alert");

    stubbed.server.nextUploadFails = false;
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
      target: { value: "Con reintento" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(window.location.pathname).toBe("/recetario"));
    const up = stubbed.calls.filter((c) => c.url === "/api/uploads");
    expect(up.length).toBe(2);
    const create = stubbed.calls.find((c) => c.method === "POST" && c.url === "/api/recipes");
    expect(String((create?.body as Record<string, unknown>)?.photo_path)).toMatch(/^recipe-/);
  });

  it("la subida FormData no fuerza content-type application/json (DEF-3)", async () => {
    const server = makeServer([]);
    const seen: { contentType: string | null | undefined } = { contentType: undefined };
    const orig = server.fetchMock;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      seen.contentType = new Headers(init?.headers).get("content-type");
      return orig(input, init);
    });
    await openPage();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOf("foto.png")] } });

    await waitFor(() => expect(seen.contentType).not.toBeUndefined());
    expect(seen.contentType).toBeNull();
  });
});
