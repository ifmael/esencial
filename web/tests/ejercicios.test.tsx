// /ejercicios catalog + detail + editor + add-to-template (E4 tasks 4.1-5.4, 6.2).

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
import type { Exercise } from "../src/lib/exercises";
import type { Template } from "../src/lib/templates";
import { type MockApi, mockApi } from "./api-mock";
import {
  morphing,
  stubViewTransitions,
  unstubViewTransitions,
} from "./view-transition-stub";

const press: Exercise = {
  id: 7,
  name: "Press banca",
  description: "Empuje horizontal con barra.",
  setupCues: "Escápulas retraídas, arcos naturales.",
  techniqueUrl: "https://youtu.be/dQw4w9WgXcQ",
  steps: [
    "Coloca la barra sobre el pecho.",
    "Baja controlado y sube empujando.",
  ],
  tags: ["pecho", "tríceps"],
  regions: ["chest-lower", "triceps-lateral"],
  kind: "strength",
};
const remo: Exercise = {
  id: 8,
  name: "Remo",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["espalda"],
  regions: ["lats-mid"],
  kind: "strength",
};
const peso: Exercise = {
  id: 9,
  name: "Peso muerto",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["pierna"],
  regions: ["quads"],
  kind: "strength",
};

const tplA = (): Template => ({
  id: 1,
  name: "A — Empuje",
  exercises: [
    {
      id: 11,
      exerciseId: 7,
      position: 0,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 8,
      targetDistanceKm: null,
      targetDurationMin: null,
      exerciseName: "Press banca",
      kind: "strength",
    },
    {
      id: 12,
      exerciseId: 8,
      position: 1,
      targetSets: null,
      targetRepsMin: null,
      targetRepsMax: null,
      targetDistanceKm: null,
      targetDurationMin: null,
      exerciseName: "Remo",
      kind: "strength",
    },
  ],
});

let api: MockApi;

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

beforeEach(() => {
  api = mockApi({ templates: [tplA()], exercises: [press, remo, peso] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  unstubViewTransitions();
});

describe("catalog", () => {
  it("lists cards with name + tag chips in API order", async () => {
    renderAt("/ejercicios");
    // The E7 guard (probe /api/auth/status) adds an async tick before the
    // catalog mounts; wait for the cards, not just the heading.
    // Wait for the first card's content (the E7 guard adds an async tick
    // before the catalog mounts; the heading alone is the loading state).
    await screen.findByText("Press banca");
    const all = screen.getAllByRole("link");
    const cards = all.filter((a) =>
      a.getAttribute("href")?.startsWith("/ejercicios/"),
    );
    expect(cards.map((c) => c.getAttribute("href"))).toEqual([
      "/ejercicios/7",
      "/ejercicios/8",
      "/ejercicios/9",
    ]);
    expect(screen.getByText("pecho")).toBeDefined();
    expect(screen.getByText("tríceps")).toBeDefined();
  });

  it("client-side search by name and tag; clearing restores", async () => {
    renderAt("/ejercicios");
    const search = await screen.findByPlaceholderText(/buscar/i);
    fireEvent.change(search, { target: { value: "pecho" } });
    await waitFor(() => expect(screen.queryByText("Remo")).toBeNull());
    expect(screen.getByText("Press banca")).toBeDefined();
    const calls = api.calls.length;
    fireEvent.change(search, { target: { value: "" } });
    await waitFor(() => expect(screen.getByText("Remo")).toBeDefined());
    expect(api.calls.length).toBe(calls);
  });

  it("filtro por grupo: el chip elegido se marca y deja solo sus ejercicios", async () => {
    renderAt("/ejercicios");
    await screen.findByText("Press banca");
    const filters = screen.getByRole("group", { name: "Filtrar por grupo" });
    const espalda = within(filters).getByRole("button", { name: "Espalda" });
    fireEvent.click(espalda);
    expect(espalda.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Remo")).toBeDefined();
    expect(screen.queryByText("Press banca")).toBeNull();
    expect(screen.queryByText("Peso muerto")).toBeNull();
    fireEvent.click(within(filters).getByRole("button", { name: "Todos" }));
    expect(screen.getByText("Press banca")).toBeDefined();
  });

  it("empty catalog invites creating the first exercise", async () => {
    vi.unstubAllGlobals();
    api = mockApi({ templates: [], exercises: [] });
    renderAt("/ejercicios");
    await screen.findByText(/primer ejercicio/i);
    expect(
      screen.getByRole("button", { name: "Nuevo ejercicio" }),
    ).toBeDefined();
  });

  it("«Nuevo ejercicio» se transforma en el formulario", async () => {
    const before = stubViewTransitions();
    renderAt("/ejercicios");
    const button = await screen.findByRole("button", {
      name: "Nuevo ejercicio",
    });
    fireEvent.click(button);
    await waitFor(() => expect(before).toHaveLength(1));
    expect(before[0]).toEqual([button]);
    const form = await screen.findByRole("heading", {
      name: "Nuevo ejercicio",
    });
    expect(morphing()).toHaveLength(1);
    expect(morphing()[0].contains(form)).toBe(true);
  });

  it("create flow: name required, ≥1 group, ≥1 muscle, valid save → POST 201 + detail shows data", async () => {
    renderAt("/ejercicios");
    fireEvent.click(
      await screen.findByRole("button", { name: "Nuevo ejercicio" }),
    );
    // Página de creación propia: la lista y su cabecera ceden el sitio.
    expect(screen.queryByRole("heading", { name: "Ejercicios" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText(/nombre es obligatorio/i)).toBeDefined();
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Hip thrust" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText(/elige al menos un grupo/i)).toBeDefined();
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);

    // Los diez grupos están a la vista como fichas: se eligen con un toque.
    const groups = screen.getByRole("group", { name: "Grupos musculares" });
    fireEvent.click(within(groups).getByRole("button", { name: "Glúteo" }));
    // El grupo abre sus músculos, y sin elegir uno no se guarda.
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText(/elige al menos un músculo/i)).toBeDefined();
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Glúteo mayor" }));

    fireEvent.click(
      within(screen.getByRole("group", { name: "Tipo" })).getByRole("button", {
        name: "Bici",
      }),
    );
    fireEvent.change(screen.getByLabelText(/técnica/i), {
      target: { value: "https://youtu.be/ht" },
    });
    // Pasos numerados como en una receta: uno por campo, el vacío no viaja.
    fireEvent.change(screen.getByRole("textbox", { name: "Paso 1" }), {
      target: { value: "Paso uno" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir paso" }));
    fireEvent.click(screen.getByRole("button", { name: "Añadir paso" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Paso 3" }), {
      target: { value: "Paso dos" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Subir paso 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.state.exercises).toHaveLength(4));
    await screen.findByRole("heading", { name: "Hip thrust" });
    expect(screen.getByText("glúteo")).toBeDefined();
    expect(screen.getByText("Glúteo mayor")).toBeDefined();
    const post = api.calls.find(
      (c) => c.method === "POST" && c.url === "/api/exercises",
    )!;
    // `post.body` es el JSON que mandó el cliente al mock: es lo que se comprueba.
    const body = post.body as {
      steps: string[] | null;
      regions: string[];
      kind: string;
    };
    expect(body.steps).toEqual(["Paso uno", "Paso dos"]);
    expect(body.regions).toEqual(["gluteus-maximus"]);
    expect(body.kind).toBe("bike");
  });

  it("quitar un grupo se lleva sus músculos", async () => {
    renderAt("/ejercicios");
    fireEvent.click(
      await screen.findByRole("button", { name: "Nuevo ejercicio" }),
    );
    const groups = screen.getByRole("group", { name: "Grupos musculares" });
    const gluteo = within(groups).getByRole("button", { name: "Glúteo" });
    fireEvent.click(gluteo);
    fireEvent.click(screen.getByRole("button", { name: "Glúteo mayor" }));
    fireEvent.click(gluteo);
    expect(gluteo.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: "Glúteo mayor" })).toBeNull();
  });
});

describe("detail", () => {
  it("renders description, cues, steps, chips; YouTube embed + link with safe attrs", async () => {
    renderAt("/ejercicios/7");
    await screen.findByRole("heading", { name: "Press banca" });
    expect(screen.getByText("Empuje horizontal con barra.")).toBeDefined();
    expect(
      screen.getByText("Escápulas retraídas, arcos naturales."),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Cómo se ejecuta" }),
    ).toBeDefined();
    expect(screen.getByText("Coloca la barra sobre el pecho.")).toBeDefined();
    expect(screen.getByText("Baja controlado y sube empujando.")).toBeDefined();
    const frame = screen.getByTitle(/vídeo de técnica de press banca/i);
    expect(frame.getAttribute("src")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    const link = screen.getByRole("link", { name: /ver técnica/i });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("href")).toBe("https://youtu.be/dQw4w9WgXcQ");
  });

  it("dibuja los músculos en la vista que les toca, y solo esa", async () => {
    renderAt("/ejercicios/9");
    await screen.findByRole("heading", { name: "Peso muerto" });
    // Cuádriceps está en la vista frontal: la trasera no se pinta.
    expect(
      screen.getByRole("img", { name: "Vista frontal: Cuádriceps" }),
    ).toBeDefined();
    expect(screen.queryByRole("img", { name: /vista trasera/i })).toBeNull();
  });

  it("con músculos en las dos vistas pinta las dos", async () => {
    renderAt("/ejercicios/7");
    await screen.findByRole("heading", { name: "Press banca" });
    expect(
      screen.getByRole("img", {
        name: "Vista frontal: Pecho inferior (esternal)",
      }),
    ).toBeDefined();
    expect(
      screen.getByRole("img", {
        name: "Vista trasera: Tríceps (cabeza lateral)",
      }),
    ).toBeDefined();
  });

  it("non-YouTube techniqueUrl → link only, no iframe", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      templates: [],
      exercises: [
        { ...peso, techniqueUrl: "https://example.com/tec", steps: null },
      ],
    });
    renderAt("/ejercicios/9");
    await screen.findByRole("heading", { name: "Peso muerto" });
    expect(screen.queryByTitle(/vídeo de técnica/i)).toBeNull();
    const link = screen.getByRole("link", { name: /ver técnica/i });
    expect(link.getAttribute("href")).toBe("https://example.com/tec");
  });

  it("no techniqueUrl → no Ver técnica control", async () => {
    renderAt("/ejercicios/8");
    await screen.findByRole("heading", { name: "Remo" });
    expect(screen.queryByRole("link", { name: /ver técnica/i })).toBeNull();
  });

  it("unknown id → not-found card with back link, no crash", async () => {
    renderAt("/ejercicios/9999");
    await screen.findByText(/no existe/i);
    expect(screen.getByRole("link", { name: /volver/i })).toBeDefined();
  });

  it("add to template: PUT appends last, preserves entries + rotation; success, no nav", async () => {
    renderAt("/ejercicios/9");
    await screen.findByRole("heading", { name: "Peso muerto" });
    fireEvent.click(
      screen.getByRole("button", { name: /añadir a plantilla/i }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "A — Empuje" }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === "PUT")).toBe(true),
    );
    const put = api.calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("/api/templates/1");
    const body = put.body as { exercises: { exerciseId: number }[] };
    expect(body.exercises.map((e) => e.exerciseId)).toEqual([7, 8, 9]);
    await screen.findByText(/añadido/i);
    expect(window.location.pathname).toBe("/ejercicios/9");
  });

  it("add-to-template with no templates: empty state links to plantillas, no call", async () => {
    vi.unstubAllGlobals();
    api = mockApi({ templates: [], exercises: [peso] });
    renderAt("/ejercicios/9");
    await screen.findByRole("heading", { name: "Peso muerto" });
    fireEvent.click(
      screen.getByRole("button", { name: /añadir a plantilla/i }),
    );
    const link = await screen.findByRole("link", { name: /ir a plantillas/i });
    expect(link.getAttribute("href")).toBe("/plantillas");
    expect(
      api.calls.some((c) => c.method === "PUT" || c.method === "POST"),
    ).toBe(false);
  });

  it("edit flow: pre-filled PUT; server 400 on techniqueUrl shown inline, draft kept", async () => {
    renderAt("/ejercicios/8");
    await screen.findByRole("heading", { name: "Remo" });
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    const name = await screen.findByLabelText("Nombre");
    expect((name as HTMLInputElement).value).toBe("Remo");
    fireEvent.change(screen.getByLabelText(/técnica/i), {
      target: { value: "no-es-url" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText(/valid url/i);
    expect((screen.getByLabelText(/técnica/i) as HTMLInputElement).value).toBe(
      "no-es-url",
    );
    const put = api.calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("/api/exercises/8");
  });

  it("delete: confirm → 204 back to catalog, card gone", async () => {
    renderAt("/ejercicios/9");
    await screen.findByRole("heading", { name: "Peso muerto" });
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("heading", { name: "Peso muerto" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(api.state.exercises).toHaveLength(2));
    await screen.findByRole("heading", { name: "Ejercicios" });
    expect(screen.queryByText("Peso muerto")).toBeNull();
  });

  it("delete in-use: server message shown, item stays", async () => {
    renderAt("/ejercicios/7");
    await screen.findByRole("heading", { name: "Press banca" });
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText(/in-use record/i);
    expect(screen.getByRole("heading", { name: "Press banca" })).toBeDefined();
  });
});
