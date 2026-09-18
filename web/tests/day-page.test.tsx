// E5 tasks 3.2/3.3/4.x: pantalla DÍA — header con "Hoy", navegación de fechas,
// secciones RECETA/FUERZA/NOTAS con sus estados, autosave con debounce + flush.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import type { DayData } from "../src/lib/day";

const DAY = "2026-09-02";

/** Ejercicio planificado del día tal y como lo emite GET /api/day/:date. */
const strength = (
  exerciseId: number,
  exerciseName: string,
  position: number,
) => ({
  exerciseId,
  exerciseName,
  kind: "strength" as const,
  position,
  targetSets: null,
  targetDistanceKm: null,
  targetDurationMin: null,
});

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Fecha local de hoy (el cliente decide "Hoy", design D2). */
function localToday(): string {
  return iso(new Date());
}

function addLocalToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
}

function payload(over: Partial<DayData> = {}): DayData {
  return {
    date: localToday(),
    isoWeek: "2026-W36",
    dayIndex: 2,
    meals: [],
    session: null,
    note: { text: "" },
    ...over,
  };
}

let fetchMock: Mock;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock = vi.fn(async (url: string) => {
    // E7 guard probe must authenticate so the page mounts; /api/day is for the page.
    if (String(url).includes("/api/auth/status"))
      return Response.json(
        { authenticated: true },
        { status: 200, headers: { "content-type": "application/json" } },
      );
    return Response.json(
      payload({ date: String(url).slice("/api/day/".length) }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Vuelca los microtasks de fetch dentro de act (los timers siguen falsos). */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("header y navegación", () => {
  it("muestra 'Hoy' con la fecha local actual", async () => {
    renderAt("/");
    await settle();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /^Hoy/,
    );
  });

  it("avanzar días pide cada fecha nueva y quita 'Hoy'", async () => {
    renderAt("/");
    await settle();
    fetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Día siguiente" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Día siguiente" }));
    await settle();
    const dayCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/day/"),
    );
    expect(dayCalls.map((c) => c[0])).toEqual([
      `/api/day/${addLocalToday(1)}`,
      `/api/day/${addLocalToday(2)}`,
    ]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(
      /^Hoy/,
    );
  });

  it("el botón 'Hoy' vuelve a la fecha actual", async () => {
    renderAt("/");
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Día siguiente" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Ir a hoy" }));
    await settle();
    expect(fetchMock).toHaveBeenCalledWith(`/api/day/${localToday()}`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /^Hoy/,
    );
  });

  it("el input de fecha salta a la fecha elegida", async () => {
    renderAt("/");
    await settle();
    fireEvent.change(screen.getByLabelText("Ir a una fecha"), {
      target: { value: DAY },
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledWith(`/api/day/${DAY}`);
  });

  it("enlaces rápidos al plan de recetas y de fuerza (scoped al header)", async () => {
    const { container } = renderAt("/");
    await settle();
    const header = container.querySelector("header") as HTMLElement;
    expect(
      within(header).getByRole("link", { name: "Plan recetas" }),
    ).toBeDefined();
    expect(
      within(header).getByRole("link", { name: "Plan fuerza" }),
    ).toBeDefined();
  });
});

describe("sección RECETA", () => {
  it("solo tarjetas con receta, y navegación al detalle", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        payload({
          meals: [
            {
              meal: "desayuno",
              recipeId: null,
              recipeName: null,
              recipePhoto: null,
            },
            {
              meal: "cena",
              recipeId: 9,
              recipeName: "Ensalada",
              recipePhoto: "recipe-9.png",
            },
          ],
        }),
      ),
    );
    renderAt("/");
    await settle();
    expect(screen.queryByText("desayuno")).toBeNull();
    fireEvent.click(screen.getByText("Ensalada"));
    expect(window.location.pathname).toBe("/recetario/9");
  });

  it("miniatura de la foto en la tarjeta; slot sin foto no pinta img", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        payload({
          meals: [
            {
              meal: "desayuno",
              recipeId: 8,
              recipeName: "Tortilla",
              recipePhoto: null,
            },
            {
              meal: "cena",
              recipeId: 9,
              recipeName: "Ensalada",
              recipePhoto: "recipe-9.png",
            },
          ],
        }),
      ),
    );
    renderAt("/");
    await settle();
    const imgs = document.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toBe("/api/uploads/recipe-9.png");
  });

  it("sin comidas → empty state con CTA a /plan-recetas", async () => {
    renderAt("/");
    await settle();
    expect(
      screen.getByText("Aún no has planificado comidas para este día"),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Ir al plan semanal" })
        .getAttribute("href"),
    ).toBe("/plan-recetas");
  });
});

describe("sección FUERZA", () => {
  it("null → empty state con CTA a /plan-fuerza y sin botón registrar", async () => {
    renderAt("/");
    await settle();
    expect(screen.getByText("Sin sesión asignada")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Registrar sesión" }),
    ).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Ver el plan de fuerza" })
        .getAttribute("href"),
    ).toBe("/plan-fuerza");
  });

  it("planned → badge pendiente + 'Registrar sesión' lleva a /sesion/<fecha>", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        payload({
          session: {
            id: 3,
            name: "Empuje A",
            status: "planned",
            summary: null,
          },
        }),
      ),
    );
    renderAt("/");
    await settle();
    expect(screen.getByText("Empuje A")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    expect(window.location.pathname).toBe(`/sesion/${localToday()}`);
  });

  it("logged → resumen verde, sin botón registrar", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        payload({
          session: {
            id: 3,
            name: "Empuje A",
            status: "logged",
            summary: { effort: 3, exercises: 5, sets: 20 },
          },
        }),
      ),
    );
    renderAt("/");
    await settle();
    expect(screen.getByText(/5 ejercicios/)).toBeDefined();
    expect(screen.getByText(/20 series/)).toBeDefined();
    expect(screen.getByText(/esfuerzo 3\/5/)).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Registrar sesión" }),
    ).toBeNull();
  });
  it("planned con exercises → 4 listitems numerados en FUERZA", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        payload({
          session: {
            id: 3,
            name: "Empuje A",
            status: "planned",
            summary: null,
            exercises: [
              strength(1, "Press banca", 1),
              strength(2, "Press militar", 2),
              strength(3, "Fondos", 3),
              strength(4, "Aperturas", 4),
            ],
          },
        }),
      ),
    );
    renderAt("/");
    await settle();
    const fuerza = screen.getByText("FUERZA").closest("section") as HTMLElement;
    const items = within(fuerza).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(within(fuerza).getByText("Press banca")).toBeDefined();
  });

  it("exercises ausente o [] no rompe la tarjeta FUERZA", async () => {
    for (const exercises of [undefined, []]) {
      cleanup();
      fetchMock.mockResolvedValue(
        Response.json(
          payload({
            session: {
              id: 3,
              name: "Empuje A",
              status: "planned",
              summary: null,
              exercises,
            },
          }),
        ),
      );
      renderAt("/");
      await settle();
      const fuerza = screen
        .getByText("FUERZA")
        .closest("section") as HTMLElement;
      expect(within(fuerza).getByText("Empuje A")).toBeDefined();
      expect(screen.queryByText(/Cannot read|Cannot destructure/)).toBeNull();
    }
  });
});

describe("sección NOTAS con autosave", () => {
  const puts = () =>
    fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/notes/"));

  it("escribe, espera el debounce y hace UN solo PUT con el texto final", async () => {
    renderAt("/");
    await settle();
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "Sentado de más" } });
    fireEvent.change(box, { target: { value: "Sentado de más otra vez" } });
    expect(puts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    expect(puts()).toHaveLength(1);
    expect(puts()[0][0]).toBe(`/api/notes/${localToday()}`);
    const init = puts()[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      text: "Sentado de más otra vez",
    });
    await settle();
    expect(screen.getByText("Guardado")).toBeDefined();
  });

  it("cambiar de fecha antes del debounce guarda en la fecha SALIENTE", async () => {
    renderAt("/");
    await settle();
    const left = localToday();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "a medias" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Día siguiente" }));
    await settle();
    expect(puts().map((c) => c[0])).toEqual([`/api/notes/${left}`]);
    const init = puts()[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ text: "a medias" });
    // el textarea de la nueva fecha muestra su propia nota (vacía), no el texto viejo
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("nota precargada sin editar no dispara PUT", async () => {
    fetchMock.mockResolvedValue(
      Response.json(payload({ note: { text: "ya escrita" } })),
    );
    renderAt("/");
    await settle();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "ya escrita",
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(puts()).toHaveLength(0);
  });

  it("PUT fallido → indicador de error con reintento y texto preservado", async () => {
    renderAt("/");
    await settle();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response("{}", { status: 500 });
      return Response.json(payload());
    });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "no guarda" },
    });
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    expect(
      screen.getByRole("button", { name: "Reintentar guardar" }),
    ).toBeDefined();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "no guarda",
    );
  });
});

describe("loading y error", () => {
  it("muestra esqueletos mientras carga", async () => {
    const gate = Promise.withResolvers<Response>();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/auth/status"))
        return Response.json(
          { authenticated: true },
          { status: 200, headers: { "content-type": "application/json" } },
        );
      return gate.promise;
    });
    renderAt("/");
    await settle();
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    gate.resolve(Response.json(payload()));
    await settle();
    expect(screen.queryAllByTestId("skeleton")).toHaveLength(0);
  });

  it("fallo de red → tarjeta de error con Reintentar que recarga la fecha", async () => {
    let broken = true;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/auth/status"))
        return Response.json(
          { authenticated: true },
          { status: 200, headers: { "content-type": "application/json" } },
        );
      if (broken) throw new TypeError("network down");
      return Response.json(
        payload({ date: String(url).slice("/api/day/".length) }),
      );
    });
    renderAt("/");
    await settle();
    const retry = screen.getByRole("button", { name: "Reintentar" });
    expect(screen.getByRole("button", { name: "Día siguiente" })).toBeDefined(); // navegación viva
    broken = false;
    fireEvent.click(retry);
    await settle();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    expect(
      screen.getByText("Aún no has planificado comidas para este día"),
    ).toBeDefined();
  });
});
