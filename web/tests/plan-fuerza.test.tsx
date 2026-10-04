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
import type { SessionPayload } from "../src/lib/plan-week";
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
  regions: [{ region: "chest-lower", role: "primary" }],
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
  regions: [{ region: "lats-mid", role: "primary" }],
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
  regions: [],
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
      restSecs: 90,
      restAfterSecs: 150,
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
      restSecs: null,
      restAfterSecs: null,
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
      restSecs: null,
      restAfterSecs: null,
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
  it("sin cabecera: el calendario es el protagonista; plantillas no aparecen listadas", async () => {
    await openPlan();
    const main = within(screen.getByRole("main"));
    // Ni título de página ni botones sobre el calendario.
    expect(main.queryByRole("heading", { level: 1 })).toBeNull();
    expect(
      main.queryByRole("button", { name: "+ Nueva plantilla" }),
    ).toBeNull();
    expect(screen.queryByText("A — Empuje")).toBeNull();
    expect(screen.queryByText(/primera plantilla/i)).toBeNull();
  });

  it("la semana entera comparte un único contenedor (rejilla compartida)", async () => {
    await openPlan();
    const main = within(screen.getByRole("main"));
    const cards = [
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ].map((day) => main.getByText(day).closest(".card"));
    expect(cards[0]).not.toBeNull();
    expect(new Set(cards).size).toBe(1);
    expect(main.getByText("2026-W36").closest(".card")).toBe(cards[0]);
    expect(
      main.getByRole("button", { name: "Semana siguiente" }).closest(".card"),
    ).toBe(cards[0]);
  });

  it("los enlaces retirados de la cabecera son la fila fina de la sección", async () => {
    await openPlan();
    const main = within(screen.getByRole("main"));
    const subnav = within(
      await main.findByRole("navigation", { name: "Deporte" }),
    );
    expect(
      subnav.getByRole("link", { name: "Ejercicios" }).getAttribute("href"),
    ).toBe("/ejercicios");
    expect(
      subnav.getByRole("link", { name: "Plantillas" }).getAttribute("href"),
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

  it("la ✕ del día pide confirmación y se puede cancelar sin desprogramar", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press],
      sessions: [
        {
          id: 1,
          date: "2026-08-31",
          name: "Empuje A",
          status: "planned",
          exercises: [],
        },
      ],
    });
    renderAt("/plan-fuerza?week=2026-W36");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Desprogramar sesión del 2026-08-31",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Confirmar desprogramar" }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByRole("button", { name: "Confirmar desprogramar" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Desprogramar sesión del 2026-08-31",
      }),
    ).toBeDefined();
    expect(api.state.sessions).toHaveLength(1);
    expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("la celda del día desglosa los ejercicios y los reparte por la columna", async () => {
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
              restSecs: null,
              restAfterSecs: null,
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
              restSecs: null,
              restAfterSecs: null,
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

    // Los ejercicios llenan la columna: la lista se queda con la altura libre y
    // cada fila se estira con ella (con un tope táctil por debajo).
    expect(list.className).toContain("flex-1");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.className).toContain("flex-1");
      expect(row.className).toContain("min-h-11");
    }
  });

  it("la fila del día desprograma un ejercicio con confirmación en línea", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press, run],
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
              restSecs: null,
              restAfterSecs: null,
            },
            {
              // Cardio en la misma celda: la ✕ es de la fila, no del tipo.
              id: 52,
              exerciseId: 10,
              exerciseName: "Running",
              kind: "running",
              position: 1,
              targetSets: null,
              targetRepsMin: null,
              targetRepsMax: null,
              targetDistanceKm: 10,
              targetDurationMin: 45,
              restSecs: null,
              restAfterSecs: null,
            },
          ],
        },
      ],
    });
    renderAt("/plan-fuerza?week=2026-W36");
    await screen.findByRole("list", { name: "Ejercicios del 2026-08-31" });
    const list = () =>
      screen.getByRole("list", { name: "Ejercicios del 2026-08-31" });
    expect(
      within(list()).getByRole("button", { name: "Desprogramar Press banca" }),
    ).toBeDefined();

    // La ✕ de la fila confirma en la propia fila y NO abre el editor del día.
    fireEvent.click(
      within(list()).getByRole("button", { name: "Desprogramar Running" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Confirmar quitar Running" }),
    ).toBeDefined();

    // Cancelar sale del paso de confirmación sin llamar a la API.
    fireEvent.click(
      screen.getByRole("button", { name: "Cancelar quitar Running" }),
    );
    expect(
      screen.queryByRole("button", { name: "Confirmar quitar Running" }),
    ).toBeNull();
    expect(mutations()).toHaveLength(0);
    expect(within(list()).getByText("Running")).toBeDefined();
    expect(api.state.sessions[0].exercises).toHaveLength(2);

    // Confirmar quita SOLO ese ejercicio del día y lo persiste.
    fireEvent.click(
      within(list()).getByRole("button", { name: "Desprogramar Running" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar quitar Running" }),
    );
    await waitFor(() =>
      expect(
        api.state.sessions[0].exercises.map((e) => e.exerciseName),
      ).toEqual(["Press banca"]),
    );
    const itemsSent = mutations()
      .filter((c) => c.method === "PUT")
      .map((c) =>
        ((c.body ?? {}).items as { exerciseId: number }[]).map(
          (i) => i.exerciseId,
        ),
      );
    expect(itemsSent).toEqual([[7]]);
    await waitFor(() =>
      expect(within(list()).queryByText("Running")).toBeNull(),
    );
    expect(within(list()).getByText("Press banca")).toBeDefined();
  });

  it("el último ejercicio del día también se quita y deja el día vacío", async () => {
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
              restSecs: null,
              restAfterSecs: null,
            },
          ],
        },
      ],
    });
    renderAt("/plan-fuerza?week=2026-W36");
    const list = await screen.findByRole("list", {
      name: "Ejercicios del 2026-08-31",
    });

    fireEvent.click(
      within(list).getByRole("button", { name: "Desprogramar Press banca" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar quitar Press banca" }),
    );

    // Sin items no hay sesión (la API exige ≥1): el día se desprograma entero.
    await waitFor(() => expect(api.state.sessions).toHaveLength(0));
    expect(mutations().map((c) => c.method)).toEqual(["DELETE"]);
    await waitFor(() =>
      expect(
        screen.queryByRole("list", { name: "Ejercicios del 2026-08-31" }),
      ).toBeNull(),
    );
    expect(
      screen.queryByRole("button", {
        name: "Desprogramar sesión del 2026-08-31",
      }),
    ).toBeNull();
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
              restSecs: null,
              restAfterSecs: null,
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

  // App monta el Shell, que envuelve la pantalla en SnackbarHost: el aviso con
  // «Deshacer» es el de verdad, no un doble.
  const cellEx = (
    id: number,
    exerciseId: number,
    name: string,
    position: number,
  ) => ({
    id,
    exerciseId,
    exerciseName: name,
    kind: "strength" as const,
    position,
    targetSets: 4,
    targetRepsMin: 6,
    targetRepsMax: 8,
    targetDistanceKm: null,
    targetDurationMin: null,
    restSecs: null,
    restAfterSecs: null,
  });

  it("desprogramar un ejercicio avisa y «Deshacer» vuelve a guardar los items anteriores", async () => {
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
            cellEx(51, 7, "Press banca", 0),
            cellEx(52, 8, "Remo", 1),
          ],
        },
      ],
    });
    renderAt("/plan-fuerza?week=2026-W36");
    fireEvent.click(
      await screen.findByRole("button", { name: "Desprogramar Press banca" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar quitar Press banca" }),
    );
    expect(await screen.findByText("Press banca desprogramado")).toBeDefined();
    await waitFor(() =>
      expect(mutations().filter((c) => c.method === "PUT")).toHaveLength(1),
    );

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() =>
      expect(mutations().filter((c) => c.method === "PUT")).toHaveLength(2),
    );
    const undo = mutations().filter((c) => c.method === "PUT")[1];
    expect(undo.url).toBe("/api/plan-sessions/1");
    expect(undo.body).toEqual({
      name: "Empuje A",
      items: [7, 8].map((exerciseId) => ({
        exerciseId,
        targetSets: 4,
        targetRepsMin: 6,
        targetRepsMax: 8,
        targetDistanceKm: null,
        targetDurationMin: null,
        restSecs: null,
        restAfterSecs: null,
      })),
    });
    const list = screen.getByRole("list", {
      name: "Ejercicios del 2026-08-31",
    });
    await waitFor(() =>
      expect(within(list).getByText("Press banca")).toBeDefined(),
    );
  });

  it("desprogramar la sesión avisa y «Deshacer» la recrea con POST y sus objetivos", async () => {
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
            cellEx(51, 8, "Remo", 0),
            cellEx(52, 7, "Press banca", 1),
          ],
        },
      ],
    });
    renderAt("/plan-fuerza?week=2026-W36");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Desprogramar sesión del 2026-08-31",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar desprogramar" }),
    );
    expect(
      await screen.findByText("Sesión del 2026-08-31 desprogramada"),
    ).toBeDefined();
    await waitFor(() => expect(api.state.sessions).toHaveLength(0));

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(api.state.sessions).toHaveLength(1));
    const post = mutations().find((c) => c.method === "POST");
    expect(post?.url).toBe("/api/plan-sessions");
    expect(post?.body).toEqual({
      date: "2026-08-31",
      name: "Empuje A",
      items: [8, 7].map((exerciseId) => ({
        exerciseId,
        targetSets: 4,
        targetRepsMin: 6,
        targetRepsMax: 8,
        targetDistanceKm: null,
        targetDurationMin: null,
        restSecs: null,
        restAfterSecs: null,
      })),
    });
    // La recarga devuelve el día con su desglose.
    const list = await screen.findByRole("list", {
      name: "Ejercicios del 2026-08-31",
    });
    expect(within(list).getByText("Remo")).toBeDefined();
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
    // Los ejercicios van por grupos de músculo plegables (cerrados por defecto).
    const pecho = within(dialog).getByRole("button", { name: /^Pecho \(1\)/ });
    expect(pecho.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(pecho);
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
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^Pecho \(1\)/ }),
    );
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
          restSecs: 90,
          restAfterSecs: 150,
        },
        {
          exerciseId: 8,
          targetSets: 3, // ?? 3 al expandir (explícito y editable en el día)
          targetRepsMin: null,
          targetRepsMax: null,
          targetDistanceKm: null,
          targetDurationMin: null,
          restSecs: null,
          restAfterSecs: null,
        },
        {
          exerciseId: 10,
          targetSets: null,
          targetRepsMin: null,
          targetRepsMax: null,
          targetDistanceKm: 10,
          targetDurationMin: 45,
          restSecs: null,
          restAfterSecs: null,
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

  it("el editor del día programa los descansos (placeholder 120) y viajan en el POST", async () => {
    const { dialog } = await openFirstDay();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^Pecho \(1\)/ }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Press banca" }),
    );
    const series = screen.getByLabelText(
      /^press banca descanso entre series$/i,
    );
    expect(series).toHaveProperty("placeholder", "120");
    fireEvent.change(series, { target: { value: "60" } });
    fireEvent.change(
      screen.getByLabelText(/^press banca descanso al terminar$/i),
      { target: { value: "240" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.state.sessions).toHaveLength(1));
    // Frontera una vez: el body del mock llega como Record<string, unknown>.
    const post = mutations().find((c) => c.method === "POST")!;
    const payload = post.body as unknown as SessionPayload;
    expect(payload.items[0]).toMatchObject({
      restSecs: 60,
      restAfterSecs: 240,
    });
  });

  it("la plantilla copia sus descansos al planificar; editar la plantilla no toca el día", async () => {
    const { dialog } = await openFirstDay();
    fireEvent.click(within(dialog).getByRole("button", { name: /A — Empuje/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.state.sessions).toHaveLength(1));
    expect(api.state.sessions[0].exercises[0]).toMatchObject({
      restSecs: 90,
      restAfterSecs: 150,
    });
    // La plantilla cambia después (PUT): el día ya planificado conserva lo suyo.
    await fetch("/api/templates/1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "A — Empuje",
        exercises: [
          { exerciseId: 7, targetSets: 3, restSecs: 45, restAfterSecs: 45 },
          { exerciseId: 8 },
          { exerciseId: 10 },
        ],
      }),
    });
    expect(api.state.templates[0].exercises[0].restSecs).toBe(45);
    expect(api.state.sessions[0].exercises[0]).toMatchObject({
      restSecs: 90,
      restAfterSecs: 150,
    });
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
      within(dialog).getByRole("button", { name: /^Pecho \(1\)/ }),
    );
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
              restSecs: null,
              restAfterSecs: null,
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
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^Espalda \(1\)/ }),
    );
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
              restSecs: null,
              restAfterSecs: null,
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

  it("un ejercicio suelto entra con series (3 en fuerza; el cardio, sin series)", async () => {
    const { dialog } = await openFirstDay();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^Espalda \(1\)/ }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Remo" }));
    // La fila nace con un recuento explícito, no con el campo vacío.
    const series = screen.getByLabelText(/^remo series$/i) as HTMLInputElement;
    expect(series.value).toBe("3");
    // El cardio no tiene series: sus campos son distancia y tiempo.
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^cardio \(1\)/ }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^Running · Running/ }),
    );
    expect(screen.queryByLabelText(/^running series$/i)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.state.sessions).toHaveLength(1));
    const body = mutations()[0].body as unknown as {
      items: { targetSets: number | null }[];
    };
    expect(body.items.map((i) => i.targetSets)).toEqual([3, null]);
  });

  it("ejercicio suelto repetido queda deshabilitado en el selector", async () => {
    const { dialog } = await openFirstDay();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^Espalda \(1\)/ }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Remo" }));
    expect(
      within(dialog).getByRole("button", { name: /^Remo/ }),
    ).toHaveProperty("disabled", true);
    expect(within(dialog).getByText("ya añadido")).toBeDefined();
  });

  it("«Guardar y registrar» guarda el día y abre su registro en /sesion/:fecha", async () => {
    const { dialog } = await openFirstDay();
    fireEvent.click(within(dialog).getByRole("button", { name: /A — Empuje/ }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Más formas de guardar" }),
    );
    fireEvent.click(
      within(dialog).getByRole("menuitem", { name: "Guardar y registrar" }),
    );
    await waitFor(() =>
      expect(window.location.pathname).toBe("/sesion/2026-08-31"),
    );
    expect(api.state.sessions).toHaveLength(1);
    expect(mutations().map((c) => c.method)).toEqual(["POST"]);
  });
});
