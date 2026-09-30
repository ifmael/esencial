// UI tests: shell navigation (3 secciones, submenús colapsables, active state)
// + Día empty states. The mock API answers /api/auth/status as authenticated.

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
import type { DayData } from "../src/lib/day";
import type { Exercise } from "../src/lib/exercises";
import { mockApi } from "./api-mock";
import {
  morphing,
  stubViewTransitions,
  unstubViewTransitions,
} from "./view-transition-stub";

const press: Exercise = {
  id: 7,
  name: "Press banca",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["pecho"],
  regions: ["chest-lower"],
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

  it("en las rutas de calendario el raíl plegado es el mismo que en el resto", async () => {
    window.localStorage.setItem("esencial.sidebar", "collapsed");
    renderAt("/plan-fuerza");
    // El submenú de la sección vive sobre el calendario (misma fila que en móvil).
    const chips = await screen.findByRole("navigation", { name: "Deporte" });
    expect(chips.textContent).toContain("Ejercicios");
    expect(chips.textContent).toContain("Plantillas");

    const aside = document.querySelector("aside") as HTMLElement;
    // Raíl M3E de 96 px: cada sección con su etiqueta visible, como en Hoy.
    for (const name of ["Hoy", "Deporte", "Nutrición"]) {
      expect(aside.textContent).toContain(name);
    }
    expect(aside.querySelector('a[aria-label="Deporte"]')).toBeNull();
    // Búsqueda, Ajustes y salir van solo con icono, como en cualquier ruta.
    expect(
      aside.querySelector('button[aria-label="Cerrar sesión"]'),
    ).not.toBeNull();
    expect(aside.querySelector('a[aria-label="Ajustes"]')).not.toBeNull();
    // Sin desplegables de sección: en el raíl no caben y su submenú ya está
    // sobre la rejilla. (El menú FAB de crear sí es un desplegable.)
    expect(aside.querySelector("button[aria-controls^='nav-']")).toBeNull();
    expect(aside.querySelector('button[aria-label="Crear"]')).not.toBeNull();
  });

  it("en el resto de rutas la barra lateral mantiene etiquetas y submenús", async () => {
    renderAt("/ejercicios");
    await waitFor(() =>
      expect(screen.getAllByText("Deporte").length).toBeGreaterThan(0),
    );
    const aside = document.querySelector("aside") as HTMLElement;
    expect(aside.textContent).toContain("Ajustes");
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
    expect(aside().textContent).toContain("Ajustes");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar menú" }));
    expect(aside().textContent).not.toContain("Ajustes");
    expect(aside().textContent).not.toContain("Cerrar sesión");

    // Remontar equivale a recargar: la preferencia del usuario se restaura.
    cleanup();
    renderAt("/");
    await screen.findByRole("button", { name: "Mostrar menú" });
    expect(aside().textContent).not.toContain("Ajustes");
  });

  it("pulsar Deporte o Nutrición con el menú desplegado no lo pliega", async () => {
    renderAt("/");
    await screen.findByRole("button", { name: "Ocultar menú" });
    const aside = () => document.querySelector("aside") as HTMLElement;

    fireEvent.click(within(aside()).getByRole("link", { name: "Deporte" }));
    await waitFor(() => expect(window.location.pathname).toBe("/plan-fuerza"));
    expect(screen.getByRole("button", { name: "Ocultar menú" })).toBeDefined();
    expect(aside().textContent).toContain("Ajustes");

    fireEvent.click(within(aside()).getByRole("link", { name: "Nutrición" }));
    await waitFor(() => expect(window.location.pathname).toBe("/plan-recetas"));
    expect(screen.getByRole("button", { name: "Ocultar menú" })).toBeDefined();

    // Tampoco al entrar directo: solo lo pliega el usuario.
    cleanup();
    renderAt("/plan-fuerza");
    await screen.findByRole("button", { name: "Ocultar menú" });
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

describe("Shell M3E", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    mockApi({ exercises: [press] });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("el menú FAB abre las tres acciones de crear y navega", async () => {
    renderAt("/");
    await screen.findAllByText("Deporte");
    const aside = document.querySelector("aside") as HTMLElement;
    const fab = within(aside).getByRole("button", { name: "Crear" });
    fireEvent.click(fab);
    expect(fab.getAttribute("aria-expanded")).toBe("true");
    const menu = within(aside).getByRole("menu", { name: "Crear" });
    const items = within(menu)
      .getAllByRole("menuitem")
      .map((m) => m.textContent);
    expect(items).toEqual(["Sesión de hoy", "Plantilla", "Receta"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Receta" }));
    await waitFor(() =>
      expect(window.location.pathname).toBe("/recetario/nueva"),
    );
  });

  it("cada acción del menú FAB lleva el color de su sección", async () => {
    renderAt("/");
    await screen.findAllByText("Deporte");
    const aside = document.querySelector("aside") as HTMLElement;
    fireEvent.click(within(aside).getByRole("button", { name: "Crear" }));
    const menu = within(aside).getByRole("menu", { name: "Crear" });
    const sections = within(menu)
      .getAllByRole("menuitem")
      .map((m) => m.dataset.section);
    expect(sections).toEqual(["deporte", "deporte", "nutricion"]);
  });

  it("cada acción del menú FAB se transforma en su destino", async () => {
    for (const label of ["Sesión de hoy", "Plantilla", "Receta"]) {
      const before = stubViewTransitions();
      const view = renderAt("/");
      await screen.findAllByText("Deporte");
      const aside = document.querySelector("aside") as HTMLElement;
      const fab = within(aside).getByRole("button", { name: "Crear" });
      expect(fab.style.viewTransitionName, label).not.toBe("create");
      fireEvent.click(fab);
      const item = within(aside).getByRole("menuitem", { name: label });
      fireEvent.click(item);
      // Foto «antes»: solo la acción pulsada lleva el nombre; «después», solo
      // el destino (dos iguales en una foto anulan la transición).
      await waitFor(() => expect(before, label).toHaveLength(1));
      expect(before[0], label).toEqual([item]);
      // Tras navegar, el nombre pasa de lo pulsado al destino, fuera del raíl.
      await waitFor(() =>
        expect(
          morphing().map((el) => el.closest("aside")),
          label,
        ).toEqual([null]),
      );
      view.unmount();
      unstubViewTransitions();
    }
  });

  it("el menú FAB tapa la página con un velo que lo cierra al pulsarlo", async () => {
    renderAt("/");
    await screen.findAllByText("Deporte");
    const aside = document.querySelector("aside") as HTMLElement;
    const fab = within(aside).getByRole("button", { name: "Crear" });
    fireEvent.click(fab);
    const scrim = aside.querySelector(".scrim") as HTMLElement;
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim);
    expect(fab.getAttribute("aria-expanded")).toBe("false");
    expect(within(aside).queryByRole("menu")).toBeNull();
  });

  it("sin FAB flotante donde ya hay barra de herramientas o formulario de crear", async () => {
    // El FAB flotante (móvil) va fuera del raíl; con barra propia se pisarían.
    const floatingFab = () =>
      [...document.querySelectorAll('button[aria-label="Crear"]')].filter(
        (b) => !b.closest("aside"),
      );
    for (const path of [
      "/sesion/2026-09-28",
      "/plantillas/nueva",
      "/recetario/nueva",
    ]) {
      const view = renderAt(path);
      await screen.findAllByText("Deporte");
      expect(floatingFab(), path).toHaveLength(0);
      view.unmount();
    }
    renderAt("/recetario");
    await screen.findAllByText("Deporte");
    expect(floatingFab()).toHaveLength(1);
  });

  it("cada sección tiñe la página con su color", async () => {
    const { container } = renderAt("/recetario");
    await screen.findAllByText("Nutrición");
    expect(
      container.querySelector("[data-section]")?.getAttribute("data-section"),
    ).toBe("nutricion");
    cleanup();
    const again = renderAt("/sesion/2026-09-28");
    await screen.findAllByText("Deporte");
    expect(
      again.container
        .querySelector("[data-section]")
        ?.getAttribute("data-section"),
    ).toBe("deporte");
  });
});

describe("Día (E5)", () => {
  beforeEach(() => {
    const empty: DayData = {
      date: localToday(),
      isoWeek: "2026-W36",
      dayIndex: 2,
      meals: [],
      nutrition: null,
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
