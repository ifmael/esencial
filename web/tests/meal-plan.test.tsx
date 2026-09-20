// Rejilla semanal E3: /plan-recetas renderiza 7 días × 3 comidas desde
// GET /api/meal-plan/:week, con navegación de semana, picker y quita de slots.

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

type Slot = {
  day: number;
  meal: string;
  recipeId: number | null;
  recipeName: string | null;
  recipePhoto: string | null;
};

const RECIPES = [
  { id: 7, name: "Pollo al horno", photo: null },
  { id: 3, name: "Lentejas", photo: "recipe-3.png" },
  { id: 8, name: "Tarta de polen", photo: null },
];

let slots: Slot[] = [];
let recipeCalls = 0;
let mealPlanCalls: string[] = [];
let failNextPut = false;
let apiDown = false;

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

beforeEach(() => {
  slots = [];
  recipeCalls = 0;
  mealPlanCalls = [];
  failNextPut = false;
  apiDown = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (rawUrl: string, init?: RequestInit) => {
      const url = String(rawUrl);
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/meal-plan/")) {
        if (apiDown) return jsonResponse({ error: "boom" }, 500);
        const week = url.split("/")[3];
        mealPlanCalls.push(`${method} ${week}`);
        if (method === "PUT") {
          if (failNextPut) {
            failNextPut = false;
            return jsonResponse(
              { error: "Duplicate slot", field: "slots" },
              400,
            );
          }
          const body = JSON.parse(String(init!.body)) as {
            slots: { day: number; meal: string; recipeId: number | null }[];
          };
          slots = body.slots.map((s) => ({
            ...s,
            recipeName:
              s.recipeId === null
                ? (slots.find((old) => old.day === s.day && old.meal === s.meal)
                    ?.recipeName ?? null)
                : (RECIPES.find((r) => r.id === s.recipeId)?.name ?? null),
            recipePhoto:
              s.recipeId === null
                ? null
                : (RECIPES.find((r) => r.id === s.recipeId)?.photo ?? null),
          }));
        }
        return jsonResponse({ isoWeek: week, slots });
      }
      if (url.startsWith("/api/recipes")) {
        recipeCalls += 1;
        return jsonResponse(RECIPES);
      }
      if (url.startsWith("/api/shopping-list/")) {
        return jsonResponse({ isoWeek: "2026-W36", sections: [] });
      }
      return jsonResponse({ error: "not found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("rejilla 7×3", () => {
  it("semana vacía: 21 celdas '+ añadir' y etiquetas de días en español", async () => {
    renderAt("/plan-recetas?week=2026-W36");
    expect((await screen.findAllByText("+ añadir")).length).toBe(21);
    for (const day of [
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ]) {
      expect(screen.getByText(day)).toBeDefined();
    }
    for (const meal of ["desayuno", "almuerzo", "cena"]) {
      expect(screen.getAllByText(meal).length).toBeGreaterThan(0);
    }
  });

  it("slots guardados muestran el nombre de la receta en su celda", async () => {
    slots = [
      {
        day: 0,
        meal: "desayuno",
        recipeId: 7,
        recipeName: "Pollo al horno",
        recipePhoto: null,
      },
    ];
    renderAt("/plan-recetas?week=2026-W36");
    expect(await screen.findByText("Pollo al horno")).toBeDefined();
    expect((await screen.findAllByText("+ añadir")).length).toBe(20);
  });

  it("fallo de API → tarjeta de error con reintento; reintentar carga la rejilla", async () => {
    apiDown = true;
    renderAt("/plan-recetas?week=2026-W36");
    const retry = await screen.findByRole("button", { name: "Reintentar" });
    apiDown = false;
    fireEvent.click(retry);
    expect((await screen.findAllByText("+ añadir")).length).toBe(21);
  });
});

describe("una sola rejilla semanal", () => {
  // Convergencia con /plan-fuerza: el chrome de la semana (contenedor, título y
  // navegación) es el mismo y envuelve a los siete días. El contenido de cada
  // columna sigue siendo el de comidas.
  it("los 7 días comparten contenedor con la cabecera de la semana dentro", async () => {
    renderAt("/plan-recetas?week=2026-W36");
    await screen.findAllByText("+ añadir");
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
});

describe("navegación de semana", () => {
  it("‹ y › cambian la semana pedida y el query ?week=", async () => {
    renderAt("/plan-recetas?week=2026-W36");
    await screen.findAllByText("+ añadir");
    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    await waitFor(() => expect(window.location.search).toBe("?week=2026-W35"));
    await waitFor(() => expect(mealPlanCalls).toContain("GET 2026-W35"));
    fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
    await waitFor(() => expect(window.location.search).toBe("?week=2026-W36"));
    await waitFor(() =>
      expect(mealPlanCalls.filter((c) => c === "GET 2026-W36").length).toBe(2),
    );
  });

  it("carga directa con ?week= pide esa semana, no la actual", async () => {
    renderAt("/plan-recetas?week=2030-W01");
    await waitFor(() => expect(mealPlanCalls).toContain("GET 2030-W01"));
    expect(mealPlanCalls.some((c) => /GET 2026-W/.test(c))).toBe(false);
  });
});

describe("picker de recetas", () => {
  it("abre overlay con recetas; buscar filtra sin más fetch; elegir guarda el slot", async () => {
    renderAt("/plan-recetas?week=2026-W36");
    await screen.findAllByText("+ añadir");
    fireEvent.click(screen.getAllByText("+ añadir")[0]);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Pollo al horno");
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "pol" },
    });
    expect(within(dialog).getByText("Pollo al horno")).toBeDefined();
    expect(within(dialog).getByText("Tarta de polen")).toBeDefined();
    expect(within(dialog).queryByText("Lentejas")).toBeNull();
    expect(recipeCalls).toBe(1);
    fireEvent.click(within(dialog).getByText("Pollo al horno"));
    await screen.findByText("Pollo al horno");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mealPlanCalls).toContain("PUT 2026-W36");
    // el PUT envió solo el slot tocado (la semana entera resultante)
    expect(slots.length).toBe(1);
    expect(slots[0].recipeId).toBe(7);
  });

  it("PUT 400: la rejilla conserva el estado del servidor y muestra el error", async () => {
    slots = [
      {
        day: 0,
        meal: "desayuno",
        recipeId: 3,
        recipeName: "Lentejas",
        recipePhoto: null,
      },
    ];
    failNextPut = true;
    renderAt("/plan-recetas?week=2026-W36");
    await screen.findByText("Lentejas");
    fireEvent.click(screen.getAllByText("+ añadir")[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByText("Pollo al horno"));
    expect(await screen.findByRole("alert")).toBeDefined();
    // tras recargar, la celda 0 sigue con Lentejas (estado del servidor)
    await waitFor(() =>
      expect(screen.getAllByText("Lentejas").length).toBeGreaterThan(0),
    );
    expect(slots.length).toBe(1);
  });
});

describe("celda rellena", () => {
  it("el nombre navega a /recetario/{id}", async () => {
    slots = [
      {
        day: 5,
        meal: "cena",
        recipeId: 3,
        recipeName: "Lentejas",
        recipePhoto: null,
      },
    ];
    renderAt("/plan-recetas?week=2026-W36");
    fireEvent.click(await screen.findByText("Lentejas"));
    await waitFor(() => expect(window.location.pathname).toBe("/recetario/3"));
  });

  it("la celda rellena muestra la miniatura de la receta; sin foto no pinta img", async () => {
    slots = [
      {
        day: 5,
        meal: "cena",
        recipeId: 3,
        recipeName: "Lentejas",
        recipePhoto: "recipe-3.png",
      },
      {
        day: 0,
        meal: "desayuno",
        recipeId: 7,
        recipeName: "Pollo al horno",
        recipePhoto: null,
      },
    ];
    renderAt("/plan-recetas?week=2026-W36");
    await screen.findByText("Lentejas");
    const imgs = document.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toBe("/api/uploads/recipe-3.png");
  });

  it("quitar pide confirmación y PUT la semana sin ese slot", async () => {
    slots = [
      {
        day: 5,
        meal: "cena",
        recipeId: 3,
        recipeName: "Lentejas",
        recipePhoto: null,
      },
    ];
    renderAt("/plan-recetas?week=2026-W36");
    await screen.findByText("Lentejas");
    fireEvent.click(screen.getByRole("button", { name: "Quitar Lentejas" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirmar quitar" }),
    );
    await screen.findAllByText("+ añadir");
    await waitFor(() => expect(slots.length).toBe(0));
    expect(mealPlanCalls).toContain("PUT 2026-W36");
  });
});

describe("acceso a la lista de la compra", () => {
  it("el botón 'Lista de la compra' abre la hoja", async () => {
    renderAt("/plan-recetas?week=2026-W36");
    fireEvent.click(
      await screen.findByRole("button", { name: "Lista de la compra" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Lista de la compra" }),
    ).toBeDefined();
  });
});

describe("acceso al recetario", () => {
  it("el enlace del recetario vive en la fila de la sección, no en una cabecera", async () => {
    renderAt("/plan-recetas?week=2026-W36");
    const subnav = within(
      await screen.findByRole("navigation", { name: "Nutrición" }),
    );
    expect(
      subnav.getByRole("link", { name: "Recetas" }).getAttribute("href"),
    ).toBe("/recetario");
  });
});
