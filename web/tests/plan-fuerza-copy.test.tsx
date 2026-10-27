// /plan-fuerza — copiar una sesión de un día a otro y copiar una semana
// entera a otra. Se copia el plan (ejercicios, orden, objetivos, descansos,
// cadenas y nombre), nunca el registro; y nunca se escribe sobre un día
// registrado ni sobre uno con borrador sin registrar.

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
import { snapshotOf, writeDraft } from "../src/lib/day-draft";
import type { Exercise } from "../src/lib/exercises";
import { type MockApi, mockApi, type SessionExerciseRow } from "./api-mock";

const press: Exercise = {
  id: 7,
  name: "Press banca",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["pecho"],
  aliases: [],
  regions: [{ region: "chest-lower", role: "primary" }],
  kind: "strength",
  metric: "weight_reps",
};
const remo: Exercise = {
  id: 8,
  name: "Remo",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["espalda"],
  aliases: [],
  regions: [{ region: "lats-mid", role: "primary" }],
  kind: "strength",
  metric: "weight_reps",
};
const run: Exercise = {
  id: 10,
  name: "Running",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["cardio"],
  aliases: [],
  regions: [],
  kind: "running",
  metric: "weight_reps",
};

function row(
  id: number,
  exercise: Exercise,
  position: number,
  extra: Partial<SessionExerciseRow> = {},
): SessionExerciseRow {
  return {
    id,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    kind: exercise.kind,
    metric: exercise.metric,
    position,
    targetSets: 3,
    targetRepsMin: 8,
    targetRepsMax: 10,
    targetDistanceKm: null,
    targetDurationMin: null,
    restSecs: 120,
    restAfterSecs: 90,
    superset: false,
    ...extra,
  };
}

let api: MockApi;

const mutations = () => api.calls.filter((c) => c.method !== "GET");

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

/** La semana 2026-W36 va del lunes 31 de agosto al domingo 6 de septiembre. */
async function openPlan() {
  renderAt("/plan-fuerza?week=2026-W36");
  await screen.findByText("2026-W36");
  await waitFor(() =>
    expect(api.calls.some((c) => c.url === "/api/plan-sessions")).toBe(true),
  );
}

beforeEach(() => {
  localStorage.clear();
  api = mockApi({ exercises: [press, remo, run] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("copiar un día a otro día", () => {
  it("cada columna ofrece copiar y el día vacío recibe el plan del origen", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press, remo, run],
      sessions: [
        {
          id: 1,
          date: "2026-08-31",
          name: "Empuje A",
          status: "planned",
          exercises: [
            row(11, press, 0, {
              restSecs: null,
              restAfterSecs: null,
              superset: true,
            }),
            row(12, remo, 1, { restSecs: 45, restAfterSecs: 150 }),
          ],
        },
      ],
    });
    await openPlan();

    fireEvent.click(
      screen.getByRole("button", { name: "Copiar al mar 1 sept" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Copiar sesión · mar 1 sept/,
    });
    // El origen arranca en la sesión más reciente anterior al destino.
    expect(screen.getByLabelText("Copiar desde")).toHaveProperty(
      "value",
      "2026-08-31",
    );
    expect(within(dialog).getByText("«Empuje A» · 2 ejercicios")).toBeDefined();

    fireEvent.click(within(dialog).getByRole("button", { name: "Copiar" }));
    await waitFor(() =>
      expect(api.state.sessions.some((s) => s.date === "2026-09-01")).toBe(
        true,
      ),
    );
    const copied = api.state.sessions.find((s) => s.date === "2026-09-01");
    expect(copied?.name).toBe("Empuje A");
    expect(copied?.status).toBe("planned");
    expect(copied?.exercises.map((e) => e.exerciseName)).toEqual([
      "Press banca",
      "Remo",
    ]);
    // Viajan los descansos y la cadena; nada del registro.
    expect(copied?.exercises[0]).toMatchObject({
      superset: true,
      restSecs: null,
      restAfterSecs: null,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 10,
    });
    expect(copied?.exercises[1]).toMatchObject({
      restSecs: 45,
      restAfterSecs: 150,
      superset: false,
    });

    expect(
      await screen.findByText("Sesión copiada al mar 1 sept · 2 ejercicios"),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() =>
      expect(api.state.sessions.some((s) => s.date === "2026-09-01")).toBe(
        false,
      ),
    );
    // El origen sigue intacto.
    expect(api.state.sessions.map((s) => s.date)).toEqual(["2026-08-31"]);
  });

  it("día con sesión planificada: avisa de la sustitución y Deshacer la devuelve", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press, remo, run],
      sessions: [
        {
          id: 1,
          date: "2026-08-31",
          name: "Empuje A",
          status: "planned",
          exercises: [row(11, press, 0), row(12, remo, 1)],
        },
        {
          id: 2,
          date: "2026-09-01",
          name: "Viejo",
          status: "planned",
          exercises: [row(21, run, 0, { kind: "running" })],
        },
      ],
    });
    await openPlan();

    fireEvent.click(
      screen.getByRole("button", { name: "Copiar al mar 1 sept" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Copiar sesión · mar 1 sept/,
    });
    expect(
      within(dialog).getByText("El día ya tiene 1 ejercicio: se sustituirá."),
    ).toBeDefined();

    fireEvent.click(within(dialog).getByRole("button", { name: "Copiar" }));
    await waitFor(() =>
      expect(
        api.state.sessions.find((s) => s.date === "2026-09-01")?.name,
      ).toBe("Empuje A"),
    );
    expect(
      api.state.sessions
        .find((s) => s.date === "2026-09-01")
        ?.exercises.map((e) => e.exerciseName),
    ).toEqual(["Press banca", "Remo"]);
    // Se sustituye en el sitio: el mismo id, con un PUT.
    expect(
      mutations().some(
        (c) => c.method === "PUT" && c.url === "/api/plan-sessions/2",
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() =>
      expect(
        api.state.sessions.find((s) => s.date === "2026-09-01")?.name,
      ).toBe("Viejo"),
    );
    expect(
      api.state.sessions
        .find((s) => s.date === "2026-09-01")
        ?.exercises.map((e) => e.exerciseName),
    ).toEqual(["Running"]);
  });

  it("un destino registrado se ofrece como no disponible, con el motivo a la vista", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press],
      sessions: [
        {
          id: 1,
          date: "2026-08-31",
          name: "Empuje A",
          status: "planned",
          exercises: [row(11, press, 0)],
        },
        {
          id: 2,
          date: "2026-09-01",
          name: "Hecha",
          status: "logged",
          exercises: [],
        },
      ],
    });
    await openPlan();

    const button = screen.getByRole("button", {
      name: "Copiar al mar 1 sept",
    });
    // El motivo se anuncia sin fingir que el control está deshabilitado: sigue
    // abriendo el diálogo, que es donde se explica y donde no hay «Copiar».
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.getAttribute("title")).toBe(
      "El mar 1 sept ya está registrado: no se puede copiar encima.",
    );
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", {
      name: /Copiar sesión · mar 1 sept/,
    });
    expect(
      within(dialog).getByText(
        "El mar 1 sept ya está registrado: no se puede copiar encima.",
      ),
    ).toBeDefined();
    expect(within(dialog).queryByRole("button", { name: "Copiar" })).toBeNull();
    expect(mutations()).toHaveLength(0);
  });

  it("copiar DESDE un día registrado no arrastra marcas, esfuerzo ni nota", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press],
      sessions: [
        {
          id: 1,
          date: "2026-08-31",
          name: "Hecha",
          status: "logged",
          exercises: [row(11, press, 0)],
        },
      ],
    });
    await openPlan();

    fireEvent.click(
      screen.getByRole("button", { name: "Copiar al mar 1 sept" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Copiar sesión · mar 1 sept/,
    });
    expect(within(dialog).getByLabelText("Copiar desde")).toHaveProperty(
      "value",
      "2026-08-31",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Copiar" }));
    await waitFor(() =>
      expect(api.state.sessions.some((s) => s.date === "2026-09-01")).toBe(
        true,
      ),
    );
    // El destino nace planificado y el cuerpo lleva SOLO el plan: ni series,
    // ni esfuerzo, ni nota del día registrado del que se copia.
    const created = api.state.sessions.find((s) => s.date === "2026-09-01");
    expect(created?.status).toBe("planned");
    const post = mutations().find((c) => c.method === "POST");
    expect(Object.keys(post?.body ?? {}).sort()).toEqual([
      "date",
      "items",
      "name",
    ]);
  });

  it("un destino con un borrador con trabajo sin registrar tampoco admite la copia", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press],
      sessions: [
        {
          id: 1,
          date: "2026-08-31",
          name: "Empuje A",
          status: "planned",
          exercises: [row(11, press, 0)],
        },
        {
          id: 2,
          date: "2026-09-02",
          name: "En curso",
          status: "planned",
          exercises: [row(21, press, 0)],
        },
      ],
    });
    // Borrador del modo sesión sin cerrar, con una serie ya marcada, en el
    // día destino: copiar encima perdería trabajo.
    writeDraft(
      "2026-09-02",
      snapshotOf(
        [
          {
            se: { id: 21 },
            noWeight: false,
            sets: [
              {
                weightKg: 60,
                reps: 8,
                durationSecs: null,
                done: true,
                touched: true,
              },
            ],
          },
        ],
        [],
        null,
        "",
      ),
    );

    await openPlan();
    const button = screen.getByRole("button", {
      name: "Copiar al mié 2 sept",
    });
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.getAttribute("title")).toBe(
      "El mié 2 sept tiene un borrador sin registrar: no se puede copiar encima.",
    );
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", {
      name: /Copiar sesión · mié 2 sept/,
    });
    expect(
      within(dialog).getByText(
        "El mié 2 sept tiene un borrador sin registrar: no se puede copiar encima.",
      ),
    ).toBeDefined();
    expect(within(dialog).queryByRole("button", { name: "Copiar" })).toBeNull();
    expect(mutations()).toHaveLength(0);
  });

  it("un día solo visto (el borrador que deja abrirlo, sin marcas) no bloquea la copia", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press],
      sessions: [
        {
          id: 1,
          date: "2026-08-31",
          name: "Empuje A",
          status: "planned",
          exercises: [row(11, press, 0)],
        },
        {
          id: 2,
          date: "2026-09-02",
          name: "En curso",
          status: "planned",
          exercises: [row(21, press, 0)],
        },
      ],
    });
    // Lo que escribe abrir /sesion/2026-09-02: las series del plan, sin marcar.
    writeDraft(
      "2026-09-02",
      snapshotOf(
        [
          {
            se: { id: 21 },
            noWeight: false,
            sets: [
              {
                weightKg: null,
                reps: null,
                durationSecs: null,
                done: false,
                touched: false,
              },
            ],
          },
        ],
        [],
        null,
        "",
      ),
    );

    await openPlan();
    const button = screen.getByRole("button", {
      name: "Copiar al mié 2 sept",
    });
    expect(button.getAttribute("title")).toBe("Copiar aquí desde otro día");
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", {
      name: /Copiar sesión · mié 2 sept/,
    });
    expect(within(dialog).queryByText(/borrador/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Copiar" }));
    await waitFor(() =>
      expect(
        api.state.sessions.find((s) => s.date === "2026-09-02")?.name,
      ).toBe("Empuje A"),
    );
  });
});

describe("copiar una semana a otra", () => {
  const source = (
    id: number,
    date: string,
    name: string,
    rows: SessionExerciseRow[],
  ) => ({
    id,
    date,
    name,
    status: "planned" as const,
    exercises: rows,
  });

  it("vacía y copia día a día, avisa de lo que va a pasar y se deshace entera", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press, remo, run],
      sessions: [
        source(1, "2026-08-24", "Empuje A", [
          row(11, press, 0),
          row(12, remo, 1),
        ]),
        source(2, "2026-08-25", "Pierna", [
          row(51, remo, 0),
          row(52, press, 1),
        ]),
        source(3, "2026-08-26", "Cardio", [row(21, run, 0)]),
        source(4, "2026-09-01", "Viejo", [row(31, press, 0)]),
        source(5, "2026-09-03", "Otro", [row(41, press, 0), row(42, remo, 1)]),
      ],
    });
    await openPlan();

    fireEvent.click(screen.getByRole("button", { name: "Copiar semana" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Copiar semana · 2026-W36/,
    });
    const select = within(dialog).getByLabelText(
      "Semana de origen",
    ) as HTMLSelectElement;
    // La semana que se está viendo no puede ser origen.
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain("2026-W35");
    expect(values).not.toContain("2026-W36");

    fireEvent.change(select, { target: { value: "2026-W35" } });
    expect(
      within(dialog).getByText(
        "Lun 31 ago: se copia «Empuje A» (2 ejercicios)",
      ),
    ).toBeDefined();
    expect(
      within(dialog).getByText(
        "Mar 1 sept: se sustituye por «Pierna» (2 ejercicios)",
      ),
    ).toBeDefined();
    expect(
      within(dialog).getByText("Mié 2 sept: se copia «Cardio» (1 ejercicio)"),
    ).toBeDefined();
    expect(
      within(dialog).getByText("Jue 3 sept: se borra «Otro» (2 ejercicios)"),
    ).toBeDefined();

    fireEvent.click(within(dialog).getByRole("button", { name: "Copiar" }));
    await waitFor(() =>
      expect(api.state.sessions.some((s) => s.date === "2026-09-02")).toBe(
        true,
      ),
    );
    expect(
      api.state.sessions
        .filter((s) => s.date >= "2026-08-31" && s.date <= "2026-09-06")
        .map((s) => [s.date, s.name, s.exercises.length])
        .sort(),
    ).toEqual([
      ["2026-08-31", "Empuje A", 2],
      ["2026-09-01", "Pierna", 2],
      ["2026-09-02", "Cardio", 1],
    ]);
    expect(
      await screen.findByText(
        "Semana copiada · 2 creados · 1 sustituido · 1 borrado · 5 ejercicios",
      ),
    ).toBeDefined();

    // «Deshacer» devuelve los siete días: el PUT de la sustituida y el POST de
    // la borrada entran aquí (la copia ya hizo su propio PUT al sustituir).
    const beforeUndo = mutations().length;
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() =>
      expect(
        api.state.sessions
          .filter((s) => s.date >= "2026-08-31" && s.date <= "2026-09-06")
          .map((s) => [s.date, s.name])
          .sort(),
      ).toEqual([
        ["2026-09-01", "Viejo"],
        ["2026-09-03", "Otro"],
      ]),
    );
    const undo = mutations()
      .slice(beforeUndo)
      .map((c) => `${c.method} ${c.url}`);
    expect(undo).toContain("PUT /api/plan-sessions/4");
    expect(undo).toContain("POST /api/plan-sessions");
  });

  it("si el servidor rechaza una escritura a mitad, se deshace lo aplicado y no se enseña el 409", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press, remo],
      sessions: [
        source(1, "2026-08-24", "Empuje A", [row(11, press, 0)]),
        source(2, "2026-08-26", "Espalda B", [row(21, remo, 0)]),
      ],
    });
    await openPlan();

    fireEvent.click(screen.getByRole("button", { name: "Copiar semana" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Copiar semana · 2026-W36/,
    });
    fireEvent.change(within(dialog).getByLabelText("Semana de origen"), {
      target: { value: "2026-W35" },
    });
    // Otra pestaña creó una sesión que la rejilla no conoce: el POST del
    // miércoles chocará (409) después de haber creado el lunes.
    api.state.sessions.push({
      id: 90,
      date: "2026-09-02",
      name: "Recién creada",
      status: "planned",
      exercises: [],
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Copiar" }));

    // Se deshizo el lunes que sí se había creado y el diálogo lo cuenta sin
    // enseñar el error crudo.
    expect(
      await screen.findByText(
        "No se pudo copiar la semana; se deshizo lo aplicado y la rejilla se ha recargado.",
      ),
    ).toBeDefined();
    expect(api.state.sessions.some((s) => s.date === "2026-08-31")).toBe(false);
    // El lunes sí llegó a crearse y el deshacer lo borró (no es que fallara
    // antes de escribir).
    const calls = mutations().map((c) => `${c.method} ${c.url}`);
    expect(calls).toContain("POST /api/plan-sessions");
    expect(calls.some((c) => c.startsWith("DELETE /api/plan-sessions/"))).toBe(
      true,
    );
    expect(screen.queryByText(/Ya hay una sesión ese día/)).toBeNull();
  });

  it("un destino registrado aborta la semana entera nombrando el día", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press, run],
      sessions: [
        source(1, "2026-08-24", "Empuje A", [row(11, press, 0)]),
        {
          id: 2,
          date: "2026-09-01",
          name: "Hecha",
          status: "logged",
          exercises: [],
        },
      ],
    });
    await openPlan();

    fireEvent.click(screen.getByRole("button", { name: "Copiar semana" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Copiar semana · 2026-W36/,
    });
    fireEvent.change(within(dialog).getByLabelText("Semana de origen"), {
      target: { value: "2026-W35" },
    });
    expect(
      within(dialog).getByText(
        "El mar 1 sept ya está registrado: no se puede copiar la semana.",
      ),
    ).toBeDefined();
    // Sin ofrecer «quitar»: la app no puede hacerlo.
    expect(within(dialog).queryByText(/quita|borra el registro/i)).toBeNull();
    const confirm = within(dialog).getByRole("button", { name: "Copiar" });
    expect(confirm).toHaveProperty("disabled", true);
    expect(mutations()).toHaveLength(0);
  });

  it("un día visto sin marcas no aborta la copia de la semana", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press],
      sessions: [source(1, "2026-08-24", "Empuje A", [row(11, press, 0)])],
    });
    // Abrir un día de la semana deja un borrador con las series sin marcar;
    // aquí, en un día que se crea y en uno que no se toca (`none`).
    for (const date of ["2026-09-02", "2026-09-04"])
      writeDraft(date, snapshotOf([], [], null, ""));

    await openPlan();
    fireEvent.click(screen.getByRole("button", { name: "Copiar semana" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Copiar semana · 2026-W36/,
    });
    fireEvent.change(within(dialog).getByLabelText("Semana de origen"), {
      target: { value: "2026-W35" },
    });
    expect(within(dialog).queryByText(/borrador/)).toBeNull();
    const confirm = within(dialog).getByRole("button", { name: "Copiar" });
    expect(confirm).toHaveProperty("disabled", false);

    fireEvent.click(confirm);
    await waitFor(() =>
      expect(
        api.state.sessions.find((s) => s.date === "2026-08-31")?.name,
      ).toBe("Empuje A"),
    );
  });

  it("sin semanas anteriores con sesión, el diálogo lo dice y no hay nada que elegir", async () => {
    vi.unstubAllGlobals();
    api = mockApi({
      exercises: [press],
      sessions: [source(1, "2026-09-01", "Viejo", [row(31, press, 0)])],
    });
    await openPlan();

    fireEvent.click(screen.getByRole("button", { name: "Copiar semana" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Copiar semana · 2026-W36/,
    });
    expect(
      within(dialog).getByText(
        "No hay ninguna semana anterior con sesiones que copiar.",
      ),
    ).toBeDefined();
    expect(within(dialog).queryByLabelText("Semana de origen")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Copiar" })).toBeNull();
  });
});
