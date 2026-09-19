// /plan-fuerza — rejilla semanal + editor del día (sesión) + CRUD de plantillas.

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

async function openPlan() {
  renderAt("/plan-fuerza?week=2026-W36");
  await screen.findByText("B — Tirón");
}

describe("plan screen", () => {
  it("renders header and one card per template in API order", async () => {
    await openPlan();
    expect(screen.getByRole("heading", { name: "Plan fuerza" })).toBeDefined();
    expect(api.calls.some((c) => c.url === "/api/plan-sessions")).toBe(true); // la rejilla carga la semana
    expect(api.calls.some((c) => c.url === "/api/templates")).toBe(true);
    expect(screen.getByText("A — Empuje")).toBeDefined();
  });

  it("enlace 'Ejercicios' abre el catálogo", async () => {
    await openPlan();
    const link = screen.getByRole("link", { name: "Ejercicios" });
    expect(link.getAttribute("href")).toBe("/ejercicios");
  });

  it("la rejilla semanal usa los badges del sistema (Pendiente/Hecho)", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      templates: [tplA()],
      exercises: [press],
      sessions: [
        {
          id: 1,
          date: "2026-08-31",
          name: "Empuje A",
          status: "planned",
          exercises: [],
        },
        {
          id: 2,
          date: "2026-09-01",
          name: "Cardio suave",
          status: "logged",
          exercises: [],
        },
      ],
    });
    renderAt("/plan-fuerza?week=2026-W36");
    await waitFor(() =>
      expect(screen.getByText("Pendiente").className).toContain(
        "badge-pending",
      ),
    );
    expect(screen.getByText("Hecho").className).toContain("badge-done");
    expect(screen.getByText("Empuje A")).toBeDefined();
    expect(screen.getByText("Cardio suave")).toBeDefined();
  });

  it("celda logged → tap navega a /sesion/:date", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press],
      sessions: [
        {
          id: 2,
          date: "2026-09-01",
          name: "Cardio suave",
          status: "logged",
          exercises: [],
        },
      ],
    });
    renderAt("/plan-fuerza?week=2026-W36");
    fireEvent.click(
      await screen.findByRole("button", {
        name: /ver sesión del 2026-09-01/i,
      }),
    );
    expect(window.location.pathname).toBe("/sesion/2026-09-01");
  });

  it("empty state invites creating the first template", async () => {
    vi.unstubAllGlobals();
    api = mockApi({ templates: [], exercises: [] });
    renderAt("/plan-fuerza");
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
    renderAt("/plan-fuerza");
    await screen.findByRole("button", { name: /reintentar/i });
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    await screen.findByText(/primera plantilla/i);
  });

  it("expand/collapse needs zero extra network; rows show series or cardio marcas", async () => {
    await openPlan();
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
    await openPlan();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: /A — Empuje/ }),
    );
    await screen.findByText("3 series");
    fireEvent.click(screen.getByRole("button", { name: /^Press banca/ }));
    expect(window.location.pathname).toBe("/ejercicios/7");
  });
});

describe("editor del día (sesión)", () => {
  async function openFirstDay() {
    await openPlan();
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "+ añadir" }))[0],
    );
    return screen.findByLabelText("Nombre");
  }

  it("día vacío: expandir plantilla (fuerza + cardio) y guardar → POST", async () => {
    const name = await openFirstDay();
    expect(screen.getByText(/Nueva sesión · 2026-08-31/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "+ Añadir" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /A — Empuje/ }));
    // nombre sugerido por la primera plantilla
    expect((name as HTMLInputElement).value).toBe("A — Empuje");
    expect(screen.getAllByText("Press banca").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^running distancia \(km\)$/i)).toBeDefined();
    // El picker agrupa por músculo: desplegar Pecho para ver la fila.
    fireEvent.click(within(dialog).getByRole("button", { name: "Pecho (1)" }));
    // el mismo ejercicio ya no se puede volver a añadir
    const pressBtn = within(dialog).getByRole("button", {
      name: /Press banca/,
    });
    expect(pressBtn.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.state.sessions).toHaveLength(1));
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(payloadAt(0)).toEqual({
      date: "2026-08-31",
      name: "A — Empuje",
      items: [
        {
          exerciseId: 7,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 8,
          targetDistanceKm: null,
          targetDurationMin: null,
        },
        {
          exerciseId: 8,
          targetSets: 3, // ?? 3 al expandir (explícito y editable en el día)
          targetRepsMin: null,
          targetRepsMax: null,
          targetDistanceKm: null,
          targetDurationMin: null,
        },
        {
          exerciseId: 10,
          targetSets: null,
          targetRepsMin: null,
          targetRepsMax: null,
          targetDistanceKm: 10,
          targetDurationMin: 45,
        },
      ],
    });
    const cell = await screen.findByRole("button", {
      name: /editar sesión del 2026-08-31/i,
    });
    expect(cell.textContent).toBe("A — Empuje");
  });

  it("día con sesión: editar series → PUT; eliminar → DELETE", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press, remo],
      sessions: [
        {
          id: 1,
          date: "2026-08-31",
          name: "Empuje A",
          status: "planned",
          exercises: [
            {
              id: 51,
              exerciseId: 7,
              exerciseName: "Press banca",
              kind: "strength",
              position: 0,
              targetSets: 3,
              targetRepsMin: 8,
              targetRepsMax: 8,
              targetDistanceKm: null,
              targetDurationMin: null,
            },
          ],
        },
      ],
    });
    renderAt("/plan-fuerza?week=2026-W36");
    fireEvent.click(
      await screen.findByRole("button", {
        name: /editar sesión del 2026-08-31/i,
      }),
    );
    expect(await screen.findByText(/Editar sesión · 2026-08-31/)).toBeDefined();
    fireEvent.change(screen.getByLabelText(/^press banca series$/i), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === "PUT")).toBe(true),
    );
    const putCalls = mutations().filter((c) => c.method === "PUT");
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].url).toBe("/api/plan-sessions/1");
    const putBody = putCalls[0].body as { items: { targetSets: number }[] };
    expect(putBody.items[0].targetSets).toBe(5);

    // reabrir y eliminar la sesión
    fireEvent.click(
      await screen.findByRole("button", {
        name: /editar sesión del 2026-08-31/i,
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Eliminar sesión" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(api.state.sessions).toHaveLength(0));
    expect(
      api.calls.some(
        (c) => c.method === "DELETE" && c.url === "/api/plan-sessions/1",
      ),
    ).toBe(true);
  });

  it("ejercicio suelto repetido queda deshabilitado en el picker", async () => {
    await openFirstDay();
    fireEvent.click(screen.getByRole("button", { name: "+ Añadir" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Espalda (1)" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /Remo/ }));
    expect(within(dialog).getByRole("button", { name: /Remo/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(within(dialog).getByText("ya añadido")).toBeDefined();
  });

  it("picker del día: ejercicios por grupo plegados; el buscador despliega coincidencias", async () => {
    await openFirstDay();
    fireEvent.click(screen.getByRole("button", { name: "+ Añadir" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Pecho (1)" }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Espalda (1)" }),
    ).toBeDefined();
    expect(within(dialog).queryByRole("button", { name: /^Remo$/ })).toBeNull();

    const search = within(dialog).getByPlaceholderText(
      "Buscar plantilla o ejercicio…",
    );
    fireEvent.change(search, { target: { value: "remo" } });
    expect(
      within(dialog).getByRole("button", { name: /^Remo$/ }),
    ).toBeDefined();
    expect(
      within(dialog).queryByRole("button", { name: "Pecho (1)" }),
    ).toBeNull();

    fireEvent.change(search, { target: { value: "" } });
    expect(within(dialog).queryByRole("button", { name: /^Remo$/ })).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Espalda (1)" }),
    );
    expect(
      within(dialog).getByRole("button", { name: /^Remo$/ }),
    ).toBeDefined();
  });
});

describe("template editor", () => {
  async function openEditor() {
    await openPlan();
    fireEvent.click(screen.getByRole("button", { name: "+ Nueva plantilla" }));
    return screen.findByLabelText("Nombre");
  }

  it("create: valid save → single POST 201, card appears, editor closes", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "D — Movilidad" },
    });
    const dialog = await screen.findByRole("dialog", {
      name: "Nueva plantilla",
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1); // selector dentro
    const dlg = within(dialog);
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
    fireEvent.click(dlg.getByRole("button", { name: "Guardar" }));
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
    expect(screen.queryByLabelText("Nombre")).toBeNull();
  });

  it("cardio en plantilla: el picker lo lista con su tipo y acepta distancia/tiempo", async () => {
    await openEditor();
    const dlg = within(
      await screen.findByRole("dialog", { name: "Nueva plantilla" }),
    );
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
    const dlg = within(
      await screen.findByRole("dialog", { name: "Nueva plantilla" }),
    );
    // Plegado por defecto: cabeceras con conteo, sin ejercicios a la vista.
    expect(dlg.getByRole("button", { name: "Pecho (1)" })).toBeDefined();
    expect(dlg.queryByRole("button", { name: /^Press banca$/ })).toBeNull();
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
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull();
    fireEvent.click(dlg.getByRole("button", { name: "Espalda (1)" }));
    expect(dlg.getByRole("button", { name: /^Remo$/ })).toBeDefined();

    fireEvent.click(dlg.getByRole("button", { name: "Core" }));
    expect(dlg.getByText(/sin ejercicios/i)).toBeDefined();
  });

  it("edit: pre-filled; rename + reorder + targets → single PUT", async () => {
    await openPlan();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: "Editar" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Editar plantilla",
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const name = within(dialog).getByLabelText("Nombre");
    expect((name as HTMLInputElement).value).toBe("A — Empuje");
    fireEvent.change(name, { target: { value: "A — Empuje y núcleo" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Bajar" })[0]); // Press moves down
    fireEvent.change(screen.getAllByLabelText("Series")[1], {
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
    expect(body.exercises.map((e) => e.exerciseId)).toEqual([8, 7, 10]); // displaced swap, no gaps/dupes
    expect(body.exercises[1].targetSets).toBe(4);
    await screen.findByText("A — Empuje y núcleo");
  });

  it("cancel discards the draft with zero mutation calls", async () => {
    await openPlan();
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
    await openPlan();
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
    await openPlan();
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
    await openPlan();
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
    await openPlan();
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

describe("modal de plantilla: selector embebido", () => {
  async function openNewModal() {
    await openPlan();
    fireEvent.click(screen.getByRole("button", { name: "+ Nueva plantilla" }));
    return within(
      await screen.findByRole("dialog", { name: "Nueva plantilla" }),
    );
  }

  async function openEditModal() {
    await openPlan();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: "Editar" }),
    );
    return within(
      await screen.findByRole("dialog", { name: "Editar plantilla" }),
    );
  }

  it("el selector vive dentro de la única modal y arranca plegado por grupos", async () => {
    const dlg = await openNewModal();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    // Cabeceras de grupo con su conteo; ningún ejercicio a la vista.
    expect(dlg.getByRole("button", { name: "Pecho (1)" })).toBeDefined();
    expect(dlg.getByRole("button", { name: "Espalda (1)" })).toBeDefined();
    expect(dlg.getByRole("button", { name: "Pierna (1)" })).toBeDefined();
    expect(dlg.queryByRole("button", { name: /^Press banca$/ })).toBeNull();
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull();
    expect(dlg.queryByRole("button", { name: /^Sentadilla$/ })).toBeNull();
  });

  it("cada grupo se despliega y se pliega; varios pueden estar abiertos a la vez", async () => {
    const dlg = await openNewModal();
    const pecho = dlg.getByRole("button", { name: "Pecho (1)" });
    const espalda = dlg.getByRole("button", { name: "Espalda (1)" });
    expect(pecho.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(pecho);
    expect(pecho.getAttribute("aria-expanded")).toBe("true");
    expect(dlg.getByRole("button", { name: /^Press banca$/ })).toBeDefined();
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull();

    fireEvent.click(espalda);
    expect(dlg.getByRole("button", { name: /^Press banca$/ })).toBeDefined();
    expect(dlg.getByRole("button", { name: /^Remo$/ })).toBeDefined();

    fireEvent.click(pecho);
    expect(pecho.getAttribute("aria-expanded")).toBe("false");
    expect(dlg.queryByRole("button", { name: /^Press banca$/ })).toBeNull();
    expect(dlg.getByRole("button", { name: /^Remo$/ })).toBeDefined();
  });

  it("el buscador despliega los grupos con coincidencias y al limpiarlo vuelve lo plegado", async () => {
    const dlg = await openNewModal();
    fireEvent.change(dlg.getByPlaceholderText("Buscar ejercicio"), {
      target: { value: "remo" },
    });
    expect(dlg.getByRole("button", { name: /^Remo$/ })).toBeDefined();
    expect(dlg.queryByRole("button", { name: "Pecho (1)" })).toBeNull(); // sin coincidencias
    expect(dlg.getByRole("button", { name: "Espalda (1)" })).toBeDefined();

    fireEvent.change(dlg.getByPlaceholderText("Buscar ejercicio"), {
      target: { value: "" },
    });
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull();
    expect(dlg.getByRole("button", { name: "Espalda (1)" })).toBeDefined();
  });

  it("el filtro del mapa corporal despliega el grupo filtrado y Todos repliega", async () => {
    const dlg = await openNewModal();
    fireEvent.click(dlg.getByRole("button", { name: "Pecho" }));
    expect(dlg.getByRole("button", { name: /^Press banca$/ })).toBeDefined();
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull();
    fireEvent.click(dlg.getByRole("button", { name: "Todos" }));
    expect(dlg.queryByRole("button", { name: /^Press banca$/ })).toBeNull();
  });

  it("grupos y ejercicios salen en orden alfabético ascendente", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      templates: [tplA(), tplB(), tplC()],
      exercises: [
        remo, // el mock no garantiza orden de la API
        { ...press, id: 11, name: "Aperturas con mancuernas" },
        press,
        run,
        sent,
      ],
    });
    const dlg = await openNewModal();
    const cabeceras = [
      ...screen.getByRole("dialog").querySelectorAll("h3 button"),
    ].map((b) => b.textContent?.replace(/[▸▾]/g, "").trim());
    expect(cabeceras).toEqual([
      "cardio (1)",
      "Espalda (1)",
      "Pecho (2)",
      "Pierna (1)",
    ]);

    fireEvent.click(dlg.getByRole("button", { name: "Pecho (2)" }));
    const seccion = dlg
      .getByRole("button", { name: "Pecho (2)" })
      .closest("section")!;
    expect(
      within(seccion)
        .getAllByRole("listitem")
        .map((li) => li.textContent?.replace(/[▸▾]/g, "").trim()),
    ).toEqual(["Aperturas con mancuernas", "Press banca"]);
  });

  it("el mapa corporal filtra por grupo y el buscador acota; Todos reinicia", async () => {
    const dlg = await openEditModal();
    fireEvent.click(dlg.getByRole("button", { name: "Pecho" }));
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull();
    expect(dlg.getByRole("button", { name: /^Press banca$/ })).toBeDefined();
    fireEvent.click(dlg.getByRole("button", { name: "Todos" }));
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull(); // replegado
    fireEvent.click(dlg.getByRole("button", { name: "Espalda (1)" }));
    expect(dlg.getByRole("button", { name: /^Remo$/ })).toBeDefined();
    fireEvent.change(dlg.getByPlaceholderText("Buscar ejercicio"), {
      target: { value: "zzz" },
    });
    expect(dlg.queryByRole("button", { name: /^Press banca$/ })).toBeNull();
    expect(dlg.getByText(/sin ejercicios/i)).toBeDefined();
  });

  it("los ejercicios ya en el borrador salen deshabilitados", async () => {
    const dlg = await openEditModal();
    fireEvent.click(dlg.getByRole("button", { name: "Pecho (1)" }));
    fireEvent.click(dlg.getByRole("button", { name: "Espalda (1)" }));
    fireEvent.click(dlg.getByRole("button", { name: "Pierna (1)" }));
    const pressBtn = dlg.getByRole("button", { name: /^Press banca$/ });
    expect(pressBtn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(pressBtn);
    fireEvent.click(dlg.getByRole("button", { name: /^Remo$/ }));
    // plantilla A = Press banca + Remo + Running: siguen siendo 3 filas
    expect(screen.getAllByRole("button", { name: "Quitar" })).toHaveLength(3);
    const sentadilla = dlg.getByRole("button", { name: /^Sentadilla$/ });
    expect(sentadilla.hasAttribute("disabled")).toBe(false);
    fireEvent.click(sentadilla);
    expect(screen.getAllByRole("button", { name: "Quitar" })).toHaveLength(4);
  });

  it("Escape cierra la modal y descarta el borrador, sin mutaciones", async () => {
    const dlg = await openEditModal();
    const before = mutations().length;
    fireEvent.change(dlg.getByLabelText("Nombre"), {
      target: { value: "basura" },
    });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mutations().length).toBe(before);
    expect(api.state.templates[0].name).toBe("A — Empuje");
  });

  it("clic en el fondo cierra la modal sin guardar", async () => {
    await openNewModal();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mutations().some((c) => c.method === "POST")).toBe(false);
  });
});
