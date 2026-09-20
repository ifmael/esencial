// /plantillas — CRUD de plantillas (agrupaciones semánticas de ejercicios),
// movido fuera del planificador semanal.

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
import type { TemplatePayload } from "../src/lib/template-draft";
import type { Template } from "../src/lib/templates";
import { type MockApi, mockApi } from "./api-mock";

const press: Exercise = {
  id: 7,
  name: "Press banca",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["pecho"],
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
  kind: "strength",
};
const sent: Exercise = {
  id: 9,
  name: "Sentadilla",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["pierna"],
  kind: "strength",
};
const run: Exercise = {
  id: 10,
  name: "Running",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["cardio"],
  kind: "running",
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
    {
      id: 13,
      exerciseId: 10,
      position: 2,
      targetSets: null,
      targetRepsMin: null,
      targetRepsMax: null,
      targetDistanceKm: 10,
      targetDurationMin: 45,
      exerciseName: "Running",
      kind: "running",
    },
  ],
});
const tplB = (): Template => ({
  id: 2,
  name: "B — Tirón",
  exercises: [],
});
const tplC = (): Template => ({
  id: 3,
  name: "C — Piernas",
  exercises: [],
});

let api: MockApi;

const mutations = () => api.calls.filter((c) => c.method !== "GET");

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

function payloadAt(i: number): TemplatePayload {
  return mutations()[i].body as unknown as TemplatePayload;
}

function cardOf(name: string): HTMLElement {
  return screen.getByText(name).closest("section")!;
}

beforeEach(() => {
  api = mockApi({
    templates: [tplA(), tplB(), tplC()],
    exercises: [press, remo, sent, run],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openPlantillas() {
  renderAt("/plantillas");
  await screen.findByText("B — Tirón");
}

describe("página de plantillas", () => {
  it("renders header and one card per template in API order", async () => {
    await openPlantillas();
    expect(screen.getByRole("heading", { name: "Plantillas" })).toBeDefined();
    expect(api.calls.some((c) => c.url === "/api/templates")).toBe(true);
    expect(screen.getByText("A — Empuje")).toBeDefined();
  });

  it("expand/collapse needs zero extra network; rows show series or cardio marcas", async () => {
    await openPlantillas();
    expect(screen.queryByText("3 series")).toBeNull();
    const before = api.calls.length;
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: /A — Empuje/ }),
    );
    await waitFor(() => expect(screen.getByText("3 series")).toBeDefined());
    expect(screen.getByText("10 km · 45 min")).toBeDefined();
    expect(api.calls.length).toBe(before);
    expect(
      within(cardOf("A — Empuje")).getByText("Remo").closest("button")
        ?.textContent,
    ).toBe("Remo");
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: /A — Empuje/ }),
    );
    expect(screen.queryByText("3 series")).toBeNull();
  });

  it("row tap navigates to /ejercicios/:id", async () => {
    await openPlantillas();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: /A — Empuje/ }),
    );
    await screen.findByText("3 series");
    fireEvent.click(screen.getByRole("button", { name: /^Press banca/ }));
    expect(window.location.pathname).toBe("/ejercicios/7");
  });

  it("empty state invites creating the first template", async () => {
    vi.unstubAllGlobals();
    api = mockApi({ templates: [], exercises: [] });
    renderAt("/plantillas");
    await screen.findByText(/primera plantilla/i);
    expect(
      screen.getByRole("button", { name: "+ Nueva plantilla" }),
    ).toBeDefined();
  });

  it("API error shows a retry card; retry reloads", async () => {
    vi.unstubAllGlobals();
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        // Guard probe must succeed so the page mounts; only /api/templates fails.
        if (String(url).includes("/api/auth/status"))
          return new Response(JSON.stringify({ authenticated: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        if (fail && String(url).includes("/api/templates")) {
          fail = false;
          throw new TypeError("Network error");
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    renderAt("/plantillas");
    await screen.findByRole("button", { name: /reintentar/i });
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    await screen.findByText(/primera plantilla/i);
  });
});

describe("template editor", () => {
  async function openEditor() {
    await openPlantillas();
    fireEvent.click(screen.getByRole("button", { name: "+ Nueva plantilla" }));
    const name = await screen.findByLabelText("Nombre");
    expect(window.location.pathname).toBe("/plantillas/nueva");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    return name;
  }

  it("create: valid save → single POST 201, card appears, modal closes", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "D — Movilidad" },
    });
    // El selector vive dentro de la propia modal: no hay un segundo diálogo.
    const dlg = within(screen.getByRole("dialog"));
    const searchesBefore = api.calls.filter(
      (c) => c.url === "/api/exercises",
    ).length;
    fireEvent.change(dlg.getByPlaceholderText("Buscar ejercicio"), {
      target: { value: "sent" },
    });
    expect(dlg.queryByRole("button", { name: /^Press banca$/ })).toBeNull(); // client-side filter
    expect(api.calls.filter((c) => c.url === "/api/exercises").length).toBe(
      searchesBefore,
    ); // search hit no network
    fireEvent.click(dlg.getByRole("button", { name: /^Sentadilla$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.state.templates).toHaveLength(4));
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(payloadAt(0).exercises).toEqual([
      {
        exerciseId: 9,
        targetSets: null,
        targetRepsMin: null,
        targetRepsMax: null,
        targetDistanceKm: null,
        targetDurationMin: null,
      },
    ]);
    await screen.findByText("D — Movilidad");
    await waitFor(() => expect(screen.queryByLabelText("Nombre")).toBeNull());
    expect(window.location.pathname).toBe("/plantillas");
  });

  it("cardio en plantilla: el picker lo lista con su tipo y acepta distancia/tiempo", async () => {
    await openEditor();
    const dlg = within(screen.getByRole("dialog"));
    fireEvent.change(dlg.getByPlaceholderText("Buscar ejercicio"), {
      target: { value: "running" },
    });
    fireEvent.click(dlg.getByRole("button", { name: /Running · Running/ }));
    fireEvent.change(screen.getByLabelText(/^distancia \(km\)$/i), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText(/^tiempo \(min\)$/i), {
      target: { value: "55" },
    });
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "E — Cardio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.state.templates).toHaveLength(4));
    expect(payloadAt(0).exercises).toEqual([
      {
        exerciseId: 10,
        targetSets: null,
        targetRepsMin: null,
        targetRepsMax: null,
        targetDistanceKm: 12,
        targetDurationMin: 55,
      },
    ]);
  });

  it("body map: selecting a muscle group filters the list; Todos resets; empty group shows state", async () => {
    await openEditor();
    const dlg = within(screen.getByRole("dialog"));
    // Grupos plegables: se despliegan al pulsar su cabecera.
    fireEvent.click(dlg.getByRole("button", { name: /^Pecho \(1\)/ }));
    expect(dlg.getByRole("button", { name: /^Press banca$/ })).toBeDefined();
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull();

    fireEvent.click(dlg.getByRole("button", { name: "Pecho" }));
    expect(dlg.getByRole("button", { name: /^Press banca$/ })).toBeDefined();
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull();
    expect(dlg.queryByRole("button", { name: /^Sentadilla$/ })).toBeNull();

    // search refines within the selected group
    fireEvent.change(dlg.getByPlaceholderText("Buscar ejercicio"), {
      target: { value: "zzz" },
    });
    expect(dlg.queryByRole("button", { name: /^Press banca$/ })).toBeNull();
    expect(dlg.getByText(/sin ejercicios/i)).toBeDefined();
    fireEvent.change(dlg.getByPlaceholderText("Buscar ejercicio"), {
      target: { value: "" },
    });

    fireEvent.click(dlg.getByRole("button", { name: "Todos" }));
    // Vuelven a estar plegados: se despliega Espalda para ver Remo.
    fireEvent.click(dlg.getByRole("button", { name: /^Espalda \(1\)/ }));
    expect(dlg.getByRole("button", { name: /^Remo$/ })).toBeDefined();

    fireEvent.click(dlg.getByRole("button", { name: "Core" }));
    expect(dlg.getByText(/sin ejercicios/i)).toBeDefined();
  });

  it("edit: pre-filled; rename + targets → single PUT", async () => {
    await openPlantillas();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: "Editar" }),
    );
    expect(window.location.pathname).toBe("/plantillas/1/editar");
    const name = await screen.findByLabelText("Nombre");
    expect((name as HTMLInputElement).value).toBe("A — Empuje");
    fireEvent.change(name, { target: { value: "A — Empuje y núcleo" } });
    fireEvent.change(screen.getAllByLabelText("Series")[0], {
      target: { value: "4" },
    }); // Press row
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(mutations().some((c) => c.method === "PUT")).toBe(true),
    );
    expect(api.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    const put = api.calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("/api/templates/1");
    const body = put.body as unknown as TemplatePayload;
    expect(body.name).toBe("A — Empuje y núcleo");
    // El orden del borrador viaja en `position`, sin huecos ni duplicados.
    expect(body.exercises.map((e) => e.exerciseId)).toEqual([7, 8, 10]);
    expect(body.exercises[0].targetSets).toBe(4);
    await screen.findByText("A — Empuje y núcleo");
    expect(window.location.pathname).toBe("/plantillas");
  });

  it("cancel discards the draft with zero mutation calls", async () => {
    await openPlantillas();
    const before = mutations().length;
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: "Editar" }),
    );
    fireEvent.change(await screen.findByLabelText("Nombre"), {
      target: { value: "basura" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await screen.findByText("A — Empuje");
    expect(mutations().length).toBe(before);
    expect(api.state.templates[0].name).toBe("A — Empuje");
  });

  it("empty name blocks submit with inline error and no call", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText(/obligatorio/i);
    expect(mutations().some((c) => c.method === "POST")).toBe(false);
  });

  it("server duplicate name: 400 shown inline, draft preserved", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "B — Tirón" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Already exists");
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe(
      "B — Tirón",
    );
  });

  it("target editors: sets/min/max land in the PUT payload and card", async () => {
    await openPlantillas();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: "Editar" }),
    );
    await screen.findByLabelText("Nombre");
    fireEvent.change(screen.getAllByLabelText("Series")[0], {
      target: { value: "4" },
    });
    fireEvent.change(screen.getAllByLabelText("Reps mín")[0], {
      target: { value: "6" },
    });
    fireEvent.change(screen.getAllByLabelText("Reps máx")[0], {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(mutations().some((c) => c.method === "PUT")).toBe(true),
    );
    expect(payloadAt(0).exercises[0]).toEqual({
      exerciseId: 7,
      targetSets: 4,
      targetRepsMin: 6,
      targetRepsMax: 8,
      targetDistanceKm: null,
      targetDurationMin: null,
    });
    await screen.findByText("4 series");
  });

  it("remove entry from draft", async () => {
    await openPlantillas();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: "Editar" }),
    );
    await screen.findByLabelText("Nombre");
    fireEvent.click(screen.getAllByRole("button", { name: "Quitar" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(mutations().some((c) => c.method === "PUT")).toBe(true),
    );
    expect(payloadAt(0).exercises.map((e) => e.exerciseId)).toEqual([8, 10]);
  });

  it("duplicate: POST with source entries and (copia) name", async () => {
    await openPlantillas();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: "Duplicar" }),
    );
    await waitFor(() => expect(api.state.templates).toHaveLength(4));
    const copy = api.state.templates[3];
    expect(copy.name).toBe("A — Empuje (copia)");
    expect(copy.exercises.map((e) => e.exerciseId)).toEqual([7, 8, 10]);
    expect(copy.exercises[0].targetSets).toBe(3);
    expect(copy.exercises[2].targetDistanceKm).toBe(10);
    await screen.findByText("A — Empuje (copia)");
  });

  it("delete with confirmation; cancel changes nothing", async () => {
    await openPlantillas();
    fireEvent.click(
      within(cardOf("B — Tirón")).getByRole("button", { name: "Eliminar" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("B — Tirón")).toBeDefined();
    fireEvent.click(
      within(cardOf("B — Tirón")).getByRole("button", { name: "Eliminar" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.queryByText("B — Tirón")).toBeNull());
    expect(
      api.calls.some(
        (c) => c.method === "DELETE" && c.url === "/api/templates/2",
      ),
    ).toBe(true);
  });

  it("pending contract: save in flight disables button, second click ignored", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "X" },
    });
    api.hang = true;
    const save = screen.getByRole("button", { name: "Guardar" });
    fireEvent.click(save);
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(true));
    fireEvent.click(save);
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
});

describe("exercise picker modal", () => {
  async function openPicker() {
    await openPlantillas();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: "Editar" }),
    );
    await screen.findByLabelText("Nombre");
    expect(window.location.pathname).toBe("/plantillas/1/editar");
    return screen.findByRole("dialog");
  }

  it("opens a dialog with exercises grouped by muscle group", async () => {
    const dialog = await openPicker();
    const dlg = within(dialog);
    // Cabeceras con nombre y conteo; plegadas por defecto.
    expect(dlg.getByRole("button", { name: /^Pecho \(1\)/ })).toBeDefined();
    expect(dlg.getByRole("button", { name: /^Espalda \(1\)/ })).toBeDefined();
    expect(dlg.getByRole("button", { name: /^Pierna \(1\)/ })).toBeDefined();
    expect(dlg.queryByRole("button", { name: /^Press banca$/ })).toBeNull();
    // Desplegar un grupo muestra sus ejercicios (los otros siguen cerrados).
    fireEvent.click(dlg.getByRole("button", { name: /^Pecho \(1\)/ }));
    expect(dlg.getByRole("button", { name: /^Press banca$/ })).toBeDefined();
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull();
  });

  it("muscle filter narrows the picker list; Todos resets", async () => {
    const dialog = await openPicker();
    const dlg = within(dialog);
    fireEvent.click(dlg.getByRole("button", { name: "Pecho" }));
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull();
    expect(dlg.getByRole("button", { name: /^Press banca$/ })).toBeDefined();
    fireEvent.click(dlg.getByRole("button", { name: "Todos" }));
    // Sin filtro vuelven a estar plegados.
    fireEvent.click(dlg.getByRole("button", { name: /^Espalda \(1\)/ }));
    expect(dlg.getByRole("button", { name: /^Remo$/ })).toBeDefined();
  });

  it("draft exercises are disabled; re-adding is impossible", async () => {
    const dialog = await openPicker();
    const dlg = within(dialog);
    fireEvent.click(dlg.getByRole("button", { name: /^Pecho \(1\)/ }));
    const pressBtn = dlg.getByRole("button", { name: /^Press banca$/ });
    expect(pressBtn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(pressBtn);
    fireEvent.click(dlg.getByRole("button", { name: /^Espalda \(1\)/ }));
    fireEvent.click(dlg.getByRole("button", { name: /^Remo$/ }));
    // plantilla A = Press banca + Remo + Running: siguen siendo 3 filas
    expect(screen.getAllByRole("button", { name: "Quitar" })).toHaveLength(3);
    fireEvent.click(dlg.getByRole("button", { name: /^Pierna \(1\)/ }));
    const sentadilla = dlg.getByRole("button", { name: /^Sentadilla$/ });
    expect(sentadilla.hasAttribute("disabled")).toBe(false);
    fireEvent.click(sentadilla);
    expect(screen.getAllByRole("button", { name: "Quitar" })).toHaveLength(4);
  });

  it("Cancelar cierra la modal, vuelve a la lista y descarta el borrador", async () => {
    await openPicker();
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "basura" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.pathname).toBe("/plantillas");
    expect(mutations()).toHaveLength(0);
    expect(api.state.templates[0].name).toBe("A — Empuje");
  });

  it("Escape cierra la modal sin guardar", async () => {
    await openPicker();
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "A — Empuje 3" },
    });
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.pathname).toBe("/plantillas");
    expect(mutations()).toHaveLength(0);
  });
});

describe("modal de plantilla con URL propia", () => {
  it("entrar directo a /plantillas/1/editar abre la modal precargada", async () => {
    renderAt("/plantillas/1/editar");
    const name = await screen.findByLabelText("Nombre");
    expect((name as HTMLInputElement).value).toBe("A — Empuje");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    // La lista sigue detrás: las otras tarjetas se ven.
    expect(screen.getByText("B — Tirón")).toBeDefined();
  });

  it("entrar directo a /plantillas/nueva abre la modal vacía", async () => {
    renderAt("/plantillas/nueva");
    const name = await screen.findByLabelText("Nombre");
    expect((name as HTMLInputElement).value).toBe("");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("una plantilla inexistente devuelve a la lista", async () => {
    renderAt("/plantillas/99/editar");
    await screen.findByText("B — Tirón");
    await waitFor(() => expect(window.location.pathname).toBe("/plantillas"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
