// UI tests: shell navigation (3 secciones, submenús colapsables, active state)
// + Día empty states. The mock API answers /api/auth/status as authenticated.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import type { DayData } from "../src/lib/day";
import type { Exercise } from "../src/lib/exercises";
import { mockApi } from "./api-mock";

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

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe("Shell", () => {
  beforeEach(() => {
    // La preferencia del menú lateral vive en localStorage: que ningún test
    // herede el estado que dejó otro.
    window.localStorage.clear();
    mockApi({ exercises: [press] });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra las 3 secciones y los submenús arrancan colapsados", async () => {
    renderAt("/");
    // E7 guard: the shell appears once /api/auth/status resolves.
    await waitFor(() =>
      expect(screen.getAllByText("Deporte").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("Hoy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nutrición").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Ejercicios" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Plantillas" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Recetas" })).toBeNull();
  });

  it("expande Deporte, lista el submenú y navega al pulsar", async () => {
    renderAt("/");
    await waitFor(() =>
      expect(screen.getAllByText("Deporte").length).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getByRole("button", { name: "Expandir Deporte" }));
    const ejercicios = await screen.findByRole("link", { name: "Ejercicios" });
    expect(ejercicios.getAttribute("href")).toBe("/ejercicios");
    const plantillas = screen.getByRole("link", { name: "Plantillas" });
    expect(plantillas.getAttribute("href")).toBe("/plantillas");

    fireEvent.click(plantillas);
    await waitFor(() => expect(window.location.pathname).toBe("/plantillas"));
    expect(screen.getByRole("heading", { name: "Plantillas" })).toBeDefined();
  });

  it("colapsa la sección de nuevo", async () => {
    renderAt("/");
    await waitFor(() =>
      expect(screen.getAllByText("Nutrición").length).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getByRole("button", { name: "Expandir Nutrición" }));
    await screen.findByRole("link", { name: "Recetas" });
    fireEvent.click(screen.getByRole("button", { name: "Contraer Nutrición" }));
    expect(screen.queryByRole("link", { name: "Recetas" })).toBeNull();
  });

  it("auto-expande la sección activa y marca aria-current", async () => {
    renderAt("/ejercicios");
    await waitFor(() =>
      expect(screen.getAllByText("Deporte").length).toBeGreaterThan(0),
    );
    const link = await screen.findByRole("link", { name: "Ejercicios" });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(
      screen
        .getAllByText("Deporte")
        .some((el) => el.getAttribute("aria-current") === "page"),
    ).toBe(true);
  });

  it("en las rutas de calendario la barra lateral es un raíl de iconos", async () => {
    renderAt("/plan-fuerza");
    // El submenú de la sección vive sobre el calendario (misma fila que en móvil).
    const chips = await screen.findByRole("navigation", { name: "Deporte" });
    expect(chips.textContent).toContain("Ejercicios");
    expect(chips.textContent).toContain("Plantillas");

    const aside = document.querySelector("aside") as HTMLElement;
    const deporte = aside.querySelector('a[aria-label="Deporte"]');
    // Los destinos siguen ahí, con su nombre accesible, pero sin texto visible.
    expect(deporte?.getAttribute("href")).toBe("/plan-fuerza");
    expect(aside.textContent).not.toContain("Deporte");
    expect(aside.textContent).not.toContain("Sistema de diseño");
    expect(aside.textContent).not.toContain("Cerrar sesión");
    // Sin desplegables: en el raíl no caben y su submenú ya está sobre la rejilla.
    expect(aside.querySelector("button[aria-expanded]")).toBeNull();
  });

  it("en el resto de rutas la barra lateral mantiene etiquetas y submenús", async () => {
    renderAt("/ejercicios");
    await waitFor(() =>
      expect(screen.getAllByText("Deporte").length).toBeGreaterThan(0),
    );
    const aside = document.querySelector("aside") as HTMLElement;
    expect(aside.textContent).toContain("Sistema de diseño");
    expect(aside.querySelector('a[aria-label="Deporte"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: "Contraer Deporte" }),
    ).toBeDefined();
  });

  it("el botón oculta el menú lateral y la elección se recuerda al remontar", async () => {
    renderAt("/");
    await waitFor(() =>
      expect(screen.getAllByText("Deporte").length).toBeGreaterThan(0),
    );
    const aside = () => document.querySelector("aside") as HTMLElement;
    expect(aside().textContent).toContain("Sistema de diseño");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar menú" }));
    expect(aside().textContent).not.toContain("Sistema de diseño");
    expect(aside().textContent).not.toContain("Cerrar sesión");

    // Remontar equivale a recargar: la preferencia del usuario se restaura.
    cleanup();
    renderAt("/");
    await screen.findByRole("button", { name: "Mostrar menú" });
    expect(aside().textContent).not.toContain("Sistema de diseño");
  });

  it("en las rutas de calendario el menú arranca en raíl y el botón lo despliega", async () => {
    renderAt("/plan-fuerza");
    // El submenú de la sección sigue viviendo sobre el calendario.
    const chips = await screen.findByRole("navigation", { name: "Deporte" });
    expect(chips.textContent).toContain("Ejercicios");

    const aside = () => document.querySelector("aside") as HTMLElement;
    expect(aside().textContent).not.toContain("Sistema de diseño");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar menú" }));
    expect(aside().textContent).toContain("Sistema de diseño");
    expect(aside().textContent).toContain("Cerrar sesión");

    cleanup();
    renderAt("/plan-fuerza");
    await screen.findByRole("button", { name: "Ocultar menú" });
    expect(aside().textContent).toContain("Sistema de diseño");
  });

  it("navega entre secciones con el enlace principal", async () => {
    renderAt("/");
    await waitFor(() =>
      expect(screen.getAllByText("Deporte").length).toBeGreaterThan(0),
    );
    expect(
      screen
        .getAllByText("Hoy")
        .some((el) => el.getAttribute("aria-current") === "page"),
    ).toBe(true);
    fireEvent.click(screen.getAllByText("Nutrición")[0]);
    await waitFor(() => expect(window.location.pathname).toBe("/plan-recetas"));
    fireEvent.click(screen.getAllByText("Deporte")[0]);
    await waitFor(() => expect(window.location.pathname).toBe("/plan-fuerza"));
    // La página no tiene título: se reconoce por su rejilla semanal.
    expect(
      await screen.findByRole("button", { name: "Semana siguiente" }),
    ).toBeDefined();
  });
});

describe("Día (E5)", () => {
  beforeEach(() => {
    const empty: DayData = {
      date: localToday(),
      isoWeek: "2026-W36",
      dayIndex: 2,
      meals: [],
      session: null,
      note: { text: "" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/auth/status"))
          return Response.json({ authenticated: true });
        return Response.json({
          ...empty,
          date: String(url).slice("/api/day/".length),
        });
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders navigable date header and three empty sections", async () => {
    renderAt("/");
    await waitFor(() => expect(screen.getByText("FUERZA")).toBeDefined());
    const before = screen.getByRole("heading", { level: 1 }).textContent;
    expect(before).toMatch(/^Hoy/); // abre en la fecha local
    fireEvent.click(screen.getByRole("button", { name: "Día siguiente" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).not.toBe(
        before,
      ),
    );
    await waitFor(() => expect(screen.getByText("RECETA")).toBeDefined());
    expect(
      screen.getByText("Aún no has planificado comidas para este día"),
    ).toBeDefined();
    expect(screen.getByText("FUERZA")).toBeDefined();
    expect(screen.getByText("Sin sesión asignada")).toBeDefined();
    expect(screen.getByText("NOTAS DEL DÍA")).toBeDefined();
  });
});
