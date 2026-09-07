// /plan-fuerza screen + template editor (E4 tasks 2.1-2.4, 3.1-3.7, 6.1).

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
};
const remo: Exercise = {
  id: 8,
  name: "Remo",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["espalda"],
};
const sent: Exercise = {
  id: 9,
  name: "Sentadilla",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["pierna"],
};

const tplA = (): Template => ({
  id: 1,
  name: "A — Empuje",
  rotationIndex: 0,
  exercises: [
    {
      id: 11,
      exerciseId: 7,
      position: 0,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 8,
      exerciseName: "Press banca",
    },
    {
      id: 12,
      exerciseId: 8,
      position: 1,
      targetSets: null,
      targetRepsMin: null,
      targetRepsMax: null,
      exerciseName: "Remo",
    },
  ],
});
const tplB = (): Template => ({
  id: 2,
  name: "B — Tirón",
  rotationIndex: 1,
  exercises: [],
});
const tplC = (): Template => ({
  id: 3,
  name: "C — Piernas",
  rotationIndex: 2,
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
    exercises: [press, remo, sent],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openPlan() {
  renderAt("/plan-fuerza");
  await screen.findByText("B — Tirón");
}

describe("plan screen", () => {
  it("renders header, chips and one card per template in API order", async () => {
    await openPlan();
    expect(screen.getByRole("heading", { name: "Plan fuerza" })).toBeDefined();
    const chips = screen.getAllByRole("button", { name: "C — Piernas" });
    expect(chips.length).toBeGreaterThanOrEqual(2); // chip + card header
    const biz = api.calls.find((c) => !c.url.includes("/api/auth/status"));
    expect(biz?.url).toBe("/api/plan-sessions"); // la rejilla carga primero
    expect(api.calls.some((c) => c.url === "/api/templates")).toBe(true);
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

  it("expand/collapse needs zero extra network; rows show series or name only", async () => {
    await openPlan();
    expect(screen.queryByText("3 series")).toBeNull();
    const before = api.calls.length;
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: /A — Empuje/ }),
    );
    await waitFor(() => expect(screen.getByText("3 series")).toBeDefined());
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

  it("tapping chip C expands the C card", async () => {
    await openPlan();
    fireEvent.click(screen.getAllByRole("button", { name: "C — Piernas" })[0]);
    expect(cardOf("C — Piernas").getAttribute("data-expanded")).toBe("true");
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
    fireEvent.click(screen.getByRole("button", { name: "+ Añadir ejercicio" }));
    const dialog = await screen.findByRole("dialog");
    const dlg = within(dialog);
    fireEvent.change(dlg.getByPlaceholderText("Buscar ejercicio"), {
      target: { value: "sent" },
    });
    expect(dlg.queryByRole("button", { name: /^Press banca$/ })).toBeNull(); // client-side filter
    expect(api.calls.filter((c) => c.url === "/api/exercises").length).toBe(1); // search hit no network
    fireEvent.click(dlg.getByRole("button", { name: /^Sentadilla$/ }));
    fireEvent.click(dlg.getByRole("button", { name: "Cerrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.state.templates).toHaveLength(4));
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(payloadAt(0).exercises).toEqual([
      {
        exerciseId: 9,
        targetSets: null,
        targetRepsMin: null,
        targetRepsMax: null,
      },
    ]);
    await screen.findByText("D — Movilidad");
    expect(screen.queryByLabelText("Nombre")).toBeNull();
  });

  it("body map: selecting a muscle group filters the list; Todos resets; empty group shows state", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "+ Añadir ejercicio" }));
    const dialog = await screen.findByRole("dialog");
    const dlg = within(dialog);
    expect(dlg.getByRole("button", { name: /^Press banca$/ })).toBeDefined();
    expect(dlg.getByRole("button", { name: /^Remo$/ })).toBeDefined();

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
    expect(dlg.getByRole("button", { name: /^Remo$/ })).toBeDefined();

    fireEvent.click(dlg.getByRole("button", { name: "Core" }));
    expect(dlg.getByText(/sin ejercicios/i)).toBeDefined();
  });

  it("edit: pre-filled; rename + reorder + targets → single PUT", async () => {
    await openPlan();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: "Editar" }),
    );
    const name = await screen.findByLabelText("Nombre");
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
    expect(body.rotationIndex).toBe(0);
    expect(body.exercises.map((e) => e.exerciseId)).toEqual([8, 7]); // displaced swap, no gaps/dupes
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
    expect(payloadAt(0).exercises.map((e) => e.exerciseId)).toEqual([8]);
  });

  it("duplicate: POST with source entries and (copia) name", async () => {
    await openPlan();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: "Duplicar" }),
    );
    await waitFor(() => expect(api.state.templates).toHaveLength(4));
    const copy = api.state.templates[3];
    expect(copy.name).toBe("A — Empuje (copia)");
    expect(copy.exercises.map((e) => e.exerciseId)).toEqual([7, 8]);
    expect(copy.exercises[0].targetSets).toBe(3);
    expect(copy.rotationIndex).toBe(0);
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

describe("exercise picker modal", () => {
  async function openPicker() {
    await openPlan();
    fireEvent.click(
      within(cardOf("A — Empuje")).getByRole("button", { name: "Editar" }),
    );
    await screen.findByLabelText("Nombre");
    fireEvent.click(screen.getByRole("button", { name: "+ Añadir ejercicio" }));
    return screen.findByRole("dialog");
  }

  it("opens a dialog with exercises grouped by muscle group", async () => {
    const dialog = await openPicker();
    const dlg = within(dialog);
    expect(dlg.getByRole("heading", { name: "Pecho" })).toBeDefined();
    expect(dlg.getByRole("heading", { name: "Espalda" })).toBeDefined();
    expect(dlg.getByRole("heading", { name: "Pierna" })).toBeDefined();
    expect(dlg.getByRole("button", { name: /^Press banca$/ })).toBeDefined();
    expect(dlg.getByRole("button", { name: /^Remo$/ })).toBeDefined();
    expect(dlg.getByRole("button", { name: /^Sentadilla$/ })).toBeDefined();
  });

  it("muscle filter narrows the picker list; Todos resets", async () => {
    const dialog = await openPicker();
    const dlg = within(dialog);
    fireEvent.click(dlg.getByRole("button", { name: "Pecho" }));
    expect(dlg.queryByRole("button", { name: /^Remo$/ })).toBeNull();
    expect(dlg.getByRole("button", { name: /^Press banca$/ })).toBeDefined();
    fireEvent.click(dlg.getByRole("button", { name: "Todos" }));
    expect(dlg.getByRole("button", { name: /^Remo$/ })).toBeDefined();
  });

  it("draft exercises are disabled; re-adding is impossible", async () => {
    const dialog = await openPicker();
    const dlg = within(dialog);
    const press = dlg.getByRole("button", { name: /^Press banca$/ });
    expect(press.hasAttribute("disabled")).toBe(true);
    fireEvent.click(press);
    fireEvent.click(dlg.getByRole("button", { name: /^Remo$/ }));
    expect(screen.getAllByRole("button", { name: "Quitar" })).toHaveLength(2);
    const sentadilla = dlg.getByRole("button", { name: /^Sentadilla$/ });
    expect(sentadilla.hasAttribute("disabled")).toBe(false);
    fireEvent.click(sentadilla);
    expect(screen.getAllByRole("button", { name: "Quitar" })).toHaveLength(3);
  });

  it("closing with Cerrar preserves the draft", async () => {
    const dialog = await openPicker();
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "A — Empuje 2" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe(
      "A — Empuje 2",
    );
  });

  it("closing with Escape preserves the draft", async () => {
    await openPicker();
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "A — Empuje 3" },
    });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe(
      "A — Empuje 3",
    );
  });
});
