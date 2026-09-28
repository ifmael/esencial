// Hoja "Lista de la compra" E3: secciones agrupadas con cantidades, checkbox
// solo en ítems manuales (PATCH), fila "+ añadir artículo" por sección (PUT).

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
import { SnackbarHost } from "../src/components/overlay";
import { ShoppingListSheet } from "../src/components/shopping-list-sheet";
import { manualSet } from "../src/lib/shopping-list";

type Item = {
  id?: number;
  source: "recipe" | "manual";
  food: string;
  quantity: number | null;
  unit: string | null;
  checked?: boolean;
};
type Section = { section: string; items: Item[] };

let sections: Section[] = [];
let patchCalls: { id: number; body: Record<string, unknown> }[] = [];
let putItemsBodies: { items: { food: string }[] }[] = [];
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

async function openSheet() {
  renderAt("/plan-recetas?week=2026-W36");
  fireEvent.click(
    await screen.findByRole("button", { name: "Lista de la compra" }),
  );
}

beforeEach(() => {
  sections = [
    {
      section: "Frutas y verduras",
      items: [
        { source: "recipe", food: "tomate", quantity: 500, unit: "g" },
        {
          source: "manual",
          id: 11,
          food: "Aguacate",
          quantity: 2,
          unit: "ud",
          checked: false,
        },
      ],
    },
    {
      section: "Despensa",
      items: [
        {
          source: "manual",
          id: 12,
          food: "Pan",
          quantity: null,
          unit: null,
          checked: false,
        },
      ],
    },
  ];
  patchCalls = [];
  putItemsBodies = [];
  apiDown = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (rawUrl: string, init?: RequestInit) => {
      const url = String(rawUrl);
      const method = init?.method ?? "GET";
      if (apiDown) return jsonResponse({ error: "boom" }, 500);
      if (url.startsWith("/api/meal-plan/")) {
        return jsonResponse({ isoWeek: "2026-W36", slots: [] });
      }
      if (url.match(/^\/api\/shopping-list\/[^/]+$/) && method === "GET") {
        return jsonResponse({ isoWeek: "2026-W36", sections });
      }
      if (
        url.match(/^\/api\/shopping-list\/[^/]+\/items$/) &&
        method === "PUT"
      ) {
        const body = JSON.parse(String(init!.body)) as {
          items: {
            food: string;
            quantity?: number | null;
            unit?: string | null;
            section?: string | null;
            checked?: boolean;
          }[];
        };
        putItemsBodies.push(body);
        // las líneas de receta siguen derivadas del plan; los manuales se reemplazan
        const recipeOnly = sections
          .map((s) => ({
            ...s,
            items: s.items.filter((i) => i.source === "recipe"),
          }))
          .filter((s) => s.items.length > 0);
        const manual: Section[] = [];
        let nextId = 100;
        for (const it of body.items) {
          const row: Item = {
            source: "manual",
            id: nextId++,
            food: it.food,
            quantity: it.quantity ?? null,
            unit: it.unit ?? null,
            checked: it.checked ?? false,
          };
          const sec = it.section ?? "Despensa";
          const bucket = manual.find((m) => m.section === sec);
          if (bucket) bucket.items.push(row);
          else manual.push({ section: sec, items: [row] });
        }
        const merged = recipeOnly.map((s) => {
          const ms = manual.find((m) => m.section === s.section);
          if (ms) {
            manual.splice(manual.indexOf(ms), 1);
            return { ...s, items: [...s.items, ...ms.items] };
          }
          return s;
        });
        sections = [...merged, ...manual];
        return jsonResponse({ isoWeek: "2026-W36", items: body.items });
      }
      const patch = url.match(/^\/api\/shopping-list\/[^/]+\/items\/(\d+)$/);
      if (patch && method === "PATCH") {
        const id = Number(patch[1]);
        const b = JSON.parse(String(init!.body)) as Record<string, unknown>;
        patchCalls.push({ id, body: b });
        for (const s of sections)
          for (const i of s.items) if (i.id === id) Object.assign(i, b);
        return jsonResponse({
          id,
          ...sections.flatMap((s) => s.items).find((i) => i.id === id),
        });
      }
      return jsonResponse({ error: "not found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("hoja de la compra", () => {
  it("secciones agrupadas con cantidades; checkbox solo en líneas manuales", async () => {
    await openSheet();
    expect(await screen.findByText("Frutas y verduras")).toBeDefined();
    expect(screen.getByText("tomate 500 g")).toBeDefined();
    expect(screen.getByText("Pan")).toBeDefined();
    // línea de receta sin checkbox; manuales con checkbox
    expect(screen.queryByRole("checkbox", { name: /tomate/i })).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Pan/i })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: /Aguacate/i })).toBeDefined();
  });

  it("marcar un manual dispara PATCH {checked:true} y pinta el estilo completado", async () => {
    await openSheet();
    const box = await screen.findByRole("checkbox", { name: /Pan/i });
    fireEvent.click(box);
    await waitFor(() =>
      expect(patchCalls).toEqual([{ id: 12, body: { checked: true } }]),
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("checkbox", { name: /Pan/i }) as HTMLInputElement)
          .checked,
      ).toBe(true),
    );
    expect(screen.getByText("Pan").className).toMatch(
      /done|line-through|text-done/,
    );
  });

  it("'+ añadir artículo' en una sección: Enter → PUT con los manuales existentes + el nuevo", async () => {
    await openSheet();
    const despensa = (await screen.findByText("Despensa")).closest("section")!;
    const input = despensa.querySelector(
      "input[type='text'], input:not([type])",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Detergente" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(putItemsBodies.length).toBe(1));
    const sent = putItemsBodies[0];
    expect(sent.items.map((i) => i.food)).toEqual(
      expect.arrayContaining(["Pan", "Aguacate", "Detergente"]),
    );
    expect(await screen.findByText("Detergente")).toBeDefined();
  });

  it("entrada vacía no manda nada", async () => {
    await openSheet();
    const despensa = (await screen.findByText("Despensa")).closest("section")!;
    const input = despensa.querySelector(
      "input[type='text'], input:not([type])",
    ) as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(putItemsBodies.length).toBe(0));
  });

  it("API caída: error con reintento dentro de la hoja", async () => {
    apiDown = true;
    await openSheet();
    // La rejilla también falla con la API caída; el Reintentar de la hoja vive en su contenedor.
    const sheet = screen.getByRole("region", { name: "Lista de la compra" });
    const retry = await within(sheet).findByRole("button", {
      name: "Reintentar",
    });
    apiDown = false;
    fireEvent.click(retry);
    expect(await screen.findByText("Frutas y verduras")).toBeDefined();
  });
});

describe("manualSet: set manual completo para el PUT", () => {
  const list = [
    {
      section: "Frutas y verduras",
      items: [
        {
          id: null,
          source: "recipe" as const,
          food: "tomate",
          quantity: 500,
          unit: "g",
        },
        {
          id: 11,
          source: "manual" as const,
          food: "Aguacate",
          quantity: 2,
          unit: "ud",
          checked: true,
        },
      ],
    },
    {
      section: "Despensa",
      items: [
        {
          id: 12,
          source: "manual" as const,
          food: "Pan",
          quantity: null,
          unit: null,
        },
      ],
    },
  ];

  it("solo los manuales, con su sección y su estado, en orden", () => {
    expect(manualSet(list)).toEqual([
      {
        food: "Aguacate",
        quantity: 2,
        unit: "ud",
        checked: true,
        section: "Frutas y verduras",
      },
      {
        food: "Pan",
        quantity: null,
        unit: null,
        checked: false,
        section: "Despensa",
      },
    ]);
  });

  it("sin un artículo: lo quita por id y deja el resto", () => {
    expect(manualSet(list, { drop: 11 }).map((i) => i.food)).toEqual(["Pan"]);
  });

  it("con un artículo nuevo: lo añade al final sin marcar", () => {
    expect(
      manualSet(list, { add: { food: "Sal", section: "Despensa" } }).at(-1),
    ).toEqual({
      food: "Sal",
      quantity: null,
      unit: null,
      checked: false,
      section: "Despensa",
    });
  });
});

describe("quitar un manual con Deshacer", () => {
  it("Quitar → PUT sin él y snackbar; Deshacer → PUT con él de vuelta", async () => {
    render(
      <SnackbarHost>
        <ShoppingListSheet isoWeek="2026-W36" open onClose={() => {}} />
      </SnackbarHost>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Quitar Pan" }));
    await waitFor(() => expect(putItemsBodies.length).toBe(1));
    expect(putItemsBodies[0].items.map((x) => x.food)).toEqual(["Aguacate"]);
    expect(await screen.findByText("Pan quitado")).toBeDefined();
    await waitFor(() =>
      expect(screen.queryByRole("checkbox", { name: /Pan/ })).toBeNull(),
    );
    // las líneas de receta no se pueden quitar a mano
    expect(screen.queryByRole("button", { name: /Quitar tomate/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(putItemsBodies.length).toBe(2));
    expect(putItemsBodies[1].items.map((x) => x.food)).toEqual(
      expect.arrayContaining(["Aguacate", "Pan"]),
    );
    expect(await screen.findByRole("checkbox", { name: /Pan/ })).toBeDefined();
  });
});
