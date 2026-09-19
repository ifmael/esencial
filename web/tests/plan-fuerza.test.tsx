// /plan-fuerza — rejilla semanal + editor del día (sesión) en modal.
// Las plantillas ya no se listan aquí: viven en /plantillas.

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

let api: MockApi;

const mutations = () => api.calls.filter((c) => c.method !== "GET");

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

function payloadAt(i: number): TemplatePayload {
  return mutations()[i].body as unknown as TemplatePayload;
}

beforeEach(() => {
  api = mockApi({
    templates: [tplA()],
    exercises: [press, remo, run],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openPlan() {
  renderAt("/plan-fuerza?week=2026-W36");
  await screen.findByText("2026-W36"); // la rejilla cargó la semana
  // La cabecera pinta la semana antes de que el hook dispare el GET: espera.
  await waitFor(() =>
    expect(api.calls.some((c) => c.url === "/api/plan-sessions")).toBe(true),
  );
}

describe("plan screen", () => {
  it("renders header and the week grid; plantillas no aparecen listadas", async () => {
    await openPlan();
    expect(screen.getByRole("heading", { name: "Plan fuerza" })).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "+ Nueva plantilla" }),
    ).toBeNull();
    expect(screen.queryByText("A — Empuje")).toBeNull();
    expect(screen.queryByText(/primera plantilla/i)).toBeNull();
  });

  it("cabecera: enlaces a Ejercicios y Plantillas", async () => {
    await openPlan();
    const main = within(screen.getByRole("main"));
    expect(
      main.getByRole("link", { name: "Ejercicios" }).getAttribute("href"),
    ).toBe("/ejercicios");
    expect(
      main.getByRole("link", { name: "Plantillas" }).getAttribute("href"),
    ).toBe("/plantillas");
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

  it("la celda del día desglosa los ejercicios de la sesión", async () => {
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
            {
              id: 52,
              exerciseId: 8,
              exerciseName: "Remo",
              kind: "strength",
              position: 1,
              targetSets: 3,
              targetRepsMin: 10,
              targetRepsMax: 10,
              targetDistanceKm: null,
              targetDurationMin: null,
            },
          ],
        },
      ],
    });
    renderAt("/plan-fuerza?week=2026-W36");
    const list = await screen.findByRole("list", {
      name: "Ejercicios del 2026-08-31",
    });
    expect(within(list).getByText("Press banca")).toBeDefined();
    expect(within(list).getByText("Remo")).toBeDefined();
  });

  it("la celda con sesión ofrece añadir más ejercicios", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press],
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
        name: "Añadir ejercicios al 2026-08-31",
      }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: /Editar sesión · 2026-08-31/,
      }),
    ).toBeDefined();
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
});

describe("editor del día (sesión) en modal", () => {
  async function openFirstDay() {
    await openPlan();
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "+ añadir" }))[0],
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Nueva sesión · 2026-08-31/,
    });
    return { dialog, name: () => screen.getByLabelText("Nombre") };
  }

  it("clic en un día vacío abre un único modal con el lateral y el selector", async () => {
    const { dialog } = await openFirstDay();
    // Un solo diálogo: ni botón intermedio ni segundo modal apilado.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      within(dialog).queryByRole("button", { name: "+ Añadir" }),
    ).toBeNull();
    // El lateral del día y el selector de plantillas/ejercicios ya están a la vista.
    expect(
      within(dialog).getByRole("list", { name: "Ejercicios del día" }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Press banca" }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: /A — Empuje/ }),
    ).toBeDefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mutations()).toHaveLength(0);
  });

  it("día vacío: expandir plantilla (fuerza + cardio) y guardar → POST", async () => {
    const { dialog, name } = await openFirstDay();
    fireEvent.click(within(dialog).getByRole("button", { name: /A — Empuje/ }));
    // nombre sugerido por la primera plantilla
    expect((name() as HTMLInputElement).value).toBe("A — Empuje");
    const day = within(dialog).getByRole("list", {
      name: "Ejercicios del día",
    });
    expect(within(day).getByText("Press banca")).toBeDefined();
    // el cardio entra con sus campos propios (y su nombre en la etiqueta)
    expect(screen.getByLabelText(/^running distancia \(km\)$/i)).toBeDefined();
    // el mismo ejercicio ya no se puede volver a añadir
    const pressBtn = within(dialog).getByRole("button", {
      name: /^Press banca/,
    });
    expect(pressBtn.hasAttribute("disabled")).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
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
    expect(screen.queryByRole("dialog")).toBeNull();
    const cell = await screen.findByRole("button", {
      name: /editar sesión del 2026-08-31/i,
    });
    expect(cell.textContent).toBe("A — Empuje");
    // y la celda desglosa los ejercicios que trajo la plantilla
    const dayList = screen.getByRole("list", {
      name: "Ejercicios del 2026-08-31",
    });
    expect(within(dayList).getByText("Press banca")).toBeDefined();
    expect(within(dayList).getByText("Running")).toBeDefined();
  });

  it("elegir plantilla avisa en el propio modal y la marca como añadida", async () => {
    const { dialog } = await openFirstDay();
    fireEvent.click(within(dialog).getByRole("button", { name: /A — Empuje/ }));
    expect(within(dialog).getByText("Añadidos 3 ejercicios")).toBeDefined();
    const tplBtn = within(dialog).getByRole("button", { name: /A — Empuje/ });
    expect(tplBtn).toHaveProperty("disabled", true);
    expect(within(tplBtn).getByText("ya añadida")).toBeDefined();
  });

  it("plantilla con ejercicios ya en el día cuenta los que ya estaban", async () => {
    const { dialog } = await openFirstDay();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Press banca" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /A — Empuje/ }));
    expect(
      within(dialog).getByText(
        "Añadidos 2 ejercicios · 1 ejercicio ya estaba en el día",
      ),
    ).toBeDefined();
  });

  it("sesión con ejercicios: se añaden más desde el modal y persisten → PUT", async () => {
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
    const dialog = await screen.findByRole("dialog", {
      name: /Editar sesión · 2026-08-31/,
    });
    // el lateral muestra los ejercicios que ya tiene la sesión
    const day = within(dialog).getByRole("list", {
      name: "Ejercicios del día",
    });
    expect(within(day).getByText("Press banca")).toBeDefined();
    // y se añade otro sin botón intermedio
    fireEvent.click(within(dialog).getByRole("button", { name: "Remo" }));
    expect(within(day).getByText("Remo")).toBeDefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(api.state.sessions[0].exercises).toHaveLength(2),
    );
    const put = mutations().find((c) => c.method === "PUT");
    expect(put?.body?.items).toHaveLength(2);

    // reabrir: el añadido persiste junto al que ya estaba
    fireEvent.click(
      await screen.findByRole("button", {
        name: /editar sesión del 2026-08-31/i,
      }),
    );
    const reopened = await screen.findByRole("dialog", {
      name: /Editar sesión · 2026-08-31/,
    });
    const rows = within(reopened).getByRole("list", {
      name: "Ejercicios del día",
    });
    expect(within(rows).getByText("Press banca")).toBeDefined();
    expect(within(rows).getByText("Remo")).toBeDefined();
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
    const dialog = await screen.findByRole("dialog", {
      name: /Editar sesión · 2026-08-31/,
    });
    fireEvent.change(screen.getByLabelText(/^press banca series$/i), {
      target: { value: "5" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
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
    const reopened = await screen.findByRole("dialog", {
      name: /Editar sesión · 2026-08-31/,
    });
    fireEvent.click(
      within(reopened).getByRole("button", { name: "Eliminar sesión" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(api.state.sessions).toHaveLength(0));
    expect(
      api.calls.some(
        (c) => c.method === "DELETE" && c.url === "/api/plan-sessions/1",
      ),
    ).toBe(true);
  });

  it("ejercicio suelto repetido queda deshabilitado en el selector", async () => {
    const { dialog } = await openFirstDay();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remo" }));
    expect(
      within(dialog).getByRole("button", { name: /^Remo/ }),
    ).toHaveProperty("disabled", true);
    expect(within(dialog).getByText("ya añadido")).toBeDefined();
  });
});
