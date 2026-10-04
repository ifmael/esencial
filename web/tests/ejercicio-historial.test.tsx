// Ficha de ejercicio — sección «Historial»: la progresión de un vistazo, las
// series marcadas por día (la más reciente arriba), el «mejor» del histórico
// entero (lo manda el API, no la página) y el enlace al día registrado.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import type { Exercise } from "../src/lib/exercises";
import {
  type ExerciseHistorySession,
  progressMetric,
  progressPoints,
} from "../src/lib/history";

const press: Exercise = {
  id: 7,
  name: "Press banca",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["pecho"],
  regions: [],
  kind: "strength",
};

const session = (
  over: Partial<ExerciseHistorySession> & { date: string },
): ExerciseHistorySession => ({
  sessionName: "Empuje A",
  sets: [{ setIndex: 0, weightKg: 60, reps: 8 }],
  cardio: null,
  ...over,
});

type Page = {
  best: ExerciseHistorySession | null;
  sessions: ExerciseHistorySession[];
  next: string | null;
};

function stubHistory(page: Page, extra: Record<string, unknown> = {}) {
  const mock = vi.fn(async (url: string) => {
    const path = String(url);
    if (path.startsWith("/api/exercises/7/history")) return Response.json(page);
    const found = extra[path];
    if (found !== undefined) return Response.json(found);
    return Response.json({ error: "Not found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("historial del ejercicio", () => {
  it("lista las series por día y enseña el «mejor» que manda el API", async () => {
    stubHistory(
      {
        next: null,
        // El mejor es de un día que NO está en la página: lo dice el API.
        best: session({
          date: "2026-07-06",
          sessionName: "Empuje A",
          sets: [{ setIndex: 0, weightKg: 70, reps: 3 }],
        }),
        sessions: [
          session({ date: "2026-09-03", sessionName: "Empuje B" }),
          session({
            date: "2026-09-01",
            sessionName: "Empuje A",
            sets: [
              { setIndex: 0, weightKg: 55, reps: 10 },
              { setIndex: 1, weightKg: 62.5, reps: 5 },
            ],
          }),
        ],
      },
      { "/api/exercises": [press], "/api/templates": [] },
    );

    renderAt("/ejercicios/7");

    expect(
      await screen.findByRole("heading", { name: "Historial" }),
    ).toBeDefined();
    // El «mejor» del histórico entero, con su fecha: no el de la página.
    expect(await screen.findByText(/Mejor: 70×3 · .*06\/07/)).toBeDefined();
    expect(screen.queryByText(/Mejor: 62\.5×5/)).toBeNull();

    const newest = screen.getByRole("link", { name: /60×8/ });
    expect(newest.getAttribute("href")).toBe("/sesion/2026-09-03");
    const older = screen.getByRole("link", { name: /55×10 · 62\.5×5/ });
    expect(older.getAttribute("href")).toBe("/sesion/2026-09-01");
  });

  it("dibuja la progresión con los kilos de cada día", async () => {
    stubHistory(
      {
        best: session({ date: "2026-09-03" }),
        next: null,
        sessions: [
          session({ date: "2026-09-03" }),
          session({
            date: "2026-09-01",
            sets: [{ setIndex: 0, weightKg: 55, reps: 10 }],
          }),
        ],
      },
      { "/api/exercises": [press], "/api/templates": [] },
    );

    renderAt("/ejercicios/7");

    // Del más antiguo al más reciente, con los valores de la métrica elegida.
    expect(
      await screen.findByRole("img", {
        name: "Progresión de Press banca: de 55 a 60 kg en 2 sesiones",
      }),
    ).toBeDefined();
  });

  it("sin kilos la progresión mide repeticiones", async () => {
    stubHistory(
      {
        best: session({ date: "2026-09-03" }),
        next: null,
        sessions: [
          session({
            date: "2026-09-03",
            sets: [
              { setIndex: 0, weightKg: null, reps: 9 },
              { setIndex: 1, weightKg: null, reps: 4 },
            ],
          }),
          session({
            date: "2026-09-01",
            sets: [{ setIndex: 0, weightKg: null, reps: 6 }],
          }),
        ],
      },
      { "/api/exercises": [press], "/api/templates": [] },
    );

    renderAt("/ejercicios/7");

    // El día vale por su mejor serie (9), no por la suma.
    expect(
      await screen.findByRole("img", {
        name: "Progresión de Press banca: de 6 a 9 reps en 2 sesiones",
      }),
    ).toBeDefined();
  });

  it("sin registros lo dice en vez de dejar la sección vacía", async () => {
    stubHistory(
      { best: null, sessions: [], next: null },
      { "/api/exercises": [press], "/api/templates": [] },
    );

    renderAt("/ejercicios/7");

    expect(
      await screen.findByText(/Aún no hay series registradas/),
    ).toBeDefined();
    // Sin sesiones no hay gráfica ni «mejor» que enseñar.
    expect(screen.queryByRole("img", { name: /Progresión/ })).toBeNull();
    expect(screen.queryByText(/Mejor:/)).toBeNull();
  });

  it("«Ver más» pide la página siguiente con before y acumula las sesiones", async () => {
    const mock = vi.fn(async (url: string) => {
      const path = String(url);
      if (path === "/api/exercises") return Response.json([press]);
      if (path === "/api/templates") return Response.json([]);
      if (path === "/api/exercises/7/history?limit=20")
        return Response.json({
          best: session({ date: "2026-08-20" }),
          sessions: [session({ date: "2026-09-03" })],
          next: "2026-09-03",
        });
      if (path === "/api/exercises/7/history?limit=20&before=2026-09-03")
        return Response.json({
          best: session({ date: "2026-08-20" }),
          sessions: [
            session({
              date: "2026-08-20",
              sessionName: "Tirón",
              sets: [{ setIndex: 0, weightKg: 65, reps: 6 }],
            }),
          ],
          next: null,
        });
      return Response.json({ error: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", mock);

    renderAt("/ejercicios/7");
    const more = await screen.findByRole("button", { name: "Ver más" });
    fireEvent.click(more);

    const older = await screen.findByRole("link", { name: /65×6/ });
    expect(older.getAttribute("href")).toBe("/sesion/2026-08-20");
    expect(mock.mock.calls.map((c) => String(c[0]))).toContain(
      "/api/exercises/7/history?limit=20&before=2026-09-03",
    );
    // La gráfica crece con lo cargado: dos días, en orden cronológico.
    expect(
      screen.getByRole("img", {
        name: "Progresión de Press banca: de 65 a 60 kg en 2 sesiones",
      }),
    ).toBeDefined();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Ver más" })).toBeNull(),
    );
  });

  it("el cardio del ejercicio se muestra con su distancia y su tiempo", async () => {
    stubHistory(
      {
        best: session({
          date: "2026-09-02",
          sessionName: "Cardio",
          sets: [],
          cardio: { distanceKm: 9, durationMin: 48 },
        }),
        next: null,
        sessions: [
          session({
            date: "2026-09-02",
            sessionName: "Cardio",
            sets: [],
            cardio: { distanceKm: 9, durationMin: 48 },
          }),
          session({
            date: "2026-08-20",
            sessionName: "Cardio",
            sets: [],
            cardio: { distanceKm: 5, durationMin: 30 },
          }),
        ],
      },
      {
        "/api/exercises": [{ ...press, id: 7, kind: "running" }],
        "/api/templates": [],
      },
    );

    renderAt("/ejercicios/7");

    const row = await screen.findByRole("link", { name: /9 km · 48 min/ });
    expect(row.getAttribute("href")).toBe("/sesion/2026-09-02");
    // En cardio la progresión son kilómetros, y el «mejor» la distancia larga.
    expect(await screen.findByText(/Mejor: 9 km · 48 min/)).toBeDefined();
    expect(
      screen.getByRole("img", {
        name: "Progresión de Press banca: de 5 a 9 km en 2 sesiones",
      }),
    ).toBeDefined();
  });
});

describe("métrica de la progresión (helpers)", () => {
  const cardio = (over: Partial<ExerciseHistorySession> & { date: string }) =>
    session({ sets: [], cardio: { distanceKm: 5, durationMin: 30 }, ...over });

  it("elige kilos, reps o kilómetros según lo marcado", () => {
    expect(progressMetric([session({ date: "2026-09-01" })])).toBe("weightKg");
    expect(
      progressMetric([
        session({
          date: "2026-09-01",
          sets: [{ setIndex: 0, weightKg: null, reps: 8 }],
        }),
      ]),
    ).toBe("reps");
    expect(progressMetric([cardio({ date: "2026-09-01" })])).toBe("distanceKm");
    expect(progressMetric([])).toBeNull();
  });

  it("toma el mejor valor de cada día y ordena del más antiguo al más nuevo", () => {
    const sessions = [
      session({
        date: "2026-09-03",
        sets: [
          { setIndex: 0, weightKg: 60, reps: 8 },
          { setIndex: 1, weightKg: 62.5, reps: 5 },
        ],
      }),
      session({
        date: "2026-09-01",
        sets: [{ setIndex: 0, weightKg: 55, reps: 10 }],
      }),
      // Día sin marcas de fuerza: no pinta barra.
      session({ date: "2026-09-02", sets: [] }),
    ];

    expect(progressPoints(sessions, "weightKg")).toEqual([
      { date: "2026-09-01", value: 55 },
      { date: "2026-09-03", value: 62.5 },
    ]);
    expect(
      progressPoints([cardio({ date: "2026-09-01" })], "distanceKm"),
    ).toEqual([{ date: "2026-09-01", value: 5 }]);
  });
});
