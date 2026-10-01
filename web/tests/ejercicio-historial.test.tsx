// Ficha de ejercicio — sección «Historial»: las series marcadas de ese
// ejercicio por día (la más reciente arriba), con la mejor serie y enlace al
// día registrado. Solo lee: el histórico se escribe cerrando sesiones.

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
import type { ExerciseHistorySession } from "../src/lib/history";

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

type Page = { sessions: ExerciseHistorySession[]; next: string | null };

function stubHistory(page: Page, extra: Record<string, unknown> = {}) {
  const mock = vi.fn(async (url: string) => {
    const path = String(url);
    if (path.includes("/api/auth/status"))
      return Response.json({ authenticated: true });
    if (path === "/api/exercises/7/history?limit=20")
      return Response.json(page);
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
  it("lista las series por día, con la mejor, y enlaza cada día registrado", async () => {
    stubHistory(
      {
        next: null,
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
    // La mejor serie del histórico: más kilos primero.
    expect(await screen.findByText(/Mejor: 62\.5×5/)).toBeDefined();

    const newest = screen.getByRole("link", { name: /60×8/ });
    expect(newest.getAttribute("href")).toBe("/sesion/2026-09-03");
    const older = screen.getByRole("link", { name: /55×10 · 62\.5×5/ });
    expect(older.getAttribute("href")).toBe("/sesion/2026-09-01");
  });

  it("sin registros lo dice en vez de dejar la sección vacía", async () => {
    stubHistory(
      { sessions: [], next: null },
      { "/api/exercises": [press], "/api/templates": [] },
    );

    renderAt("/ejercicios/7");

    expect(
      await screen.findByText(/Aún no hay series registradas/),
    ).toBeDefined();
  });

  it("«Ver más» pide la página siguiente con before y acumula las sesiones", async () => {
    const mock = vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes("/api/auth/status"))
        return Response.json({ authenticated: true });
      if (path === "/api/exercises") return Response.json([press]);
      if (path === "/api/templates") return Response.json([]);
      if (path === "/api/exercises/7/history?limit=20")
        return Response.json({
          sessions: [session({ date: "2026-09-03" })],
          next: "2026-09-03",
        });
      if (path === "/api/exercises/7/history?limit=20&before=2026-09-03")
        return Response.json({
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
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Ver más" })).toBeNull(),
    );
  });

  it("el cardio del ejercicio se muestra con su distancia y su tiempo", async () => {
    stubHistory(
      {
        next: null,
        sessions: [
          session({
            date: "2026-09-02",
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

    const row = await screen.findByRole("link", { name: /5 km · 30 min/ });
    expect(row.getAttribute("href")).toBe("/sesion/2026-09-02");
  });
});
