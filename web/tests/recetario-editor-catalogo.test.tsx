// PR 2: el editor enlaza cada ingrediente con un alimento del catálogo
// (/api/foods) para que cuente en los macros, deja crear uno nuevo si no está y
// marcar un ingrediente como opcional (no cuenta).
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { makeRecipe, makeServer, type ServerCall } from "./fixtures";

type Server = {
  fetchMock: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  calls: ServerCall[];
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openEditor(server: Server) {
  vi.stubGlobal("fetch", server.fetchMock);
  window.history.pushState({}, "", "/recetario/7/editar");
  render(<App />);
  await screen.findByRole("heading", { name: "Editar receta" });
}

type PutBody = {
  ingredients: { food: string; foodId: number | null; optional: boolean }[];
};

async function save(server: Server): Promise<PutBody> {
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(window.location.pathname).toBe("/recetario/7"));
  const put = server.calls.find((c) => c.method === "PUT");
  return put?.body as PutBody;
}

const recipe = makeRecipe({ id: 7 });

describe("editor de receta: catálogo de alimentos", () => {
  it("dice qué ingredientes cuentan en los macros y cuáles no", async () => {
    await openEditor(makeServer([recipe]));
    expect(await screen.findByText("Cuenta como «Arroz»")).toBeDefined();
    expect(screen.getByText("No cuenta en los macros")).toBeDefined();
  });

  it("escribir el nombre exacto de un alimento del catálogo lo enlaza", async () => {
    const server = makeServer([recipe]);
    await openEditor(server);
    await screen.findByText("Cuenta como «Arroz»");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Ingrediente 2 alimento" }),
      { target: { value: "Pollo" } },
    );
    // «pechuga» no se puede pasar a gramos; en «ud» sí (Pollo pesa 150 g/ud).
    expect(
      screen.getByText("No cuenta: «pechuga» no se puede pasar a gramos"),
    ).toBeDefined();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Ingrediente 2 unidad" }),
      {
        target: { value: "ud" },
      },
    );
    expect(screen.getByText("Cuenta como «Pollo»")).toBeDefined();
    const body = await save(server);
    expect(body.ingredients[1]).toMatchObject({ food: "Pollo", foodId: 12 });
  });

  it("crear un alimento nuevo lo guarda en el catálogo y lo enlaza", async () => {
    const server = makeServer([recipe]);
    await openEditor(server);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Crear alimento para el ingrediente 2",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Nuevo alimento" });
    const input = (name: string) => within(dialog).getByLabelText(name);
    expect((input("Nombre") as HTMLInputElement).value).toBe("pollo");
    fireEvent.change(input("Nombre"), { target: { value: "Pechuga de pavo" } });
    fireEvent.change(input("Calorías (por 100 g)"), {
      target: { value: "105" },
    });
    fireEvent.change(input("Proteínas (g)"), { target: { value: "24" } });
    fireEvent.change(input("Grasas (g)"), { target: { value: "1" } });
    fireEvent.change(input("Carbohidratos (g)"), { target: { value: "0" } });
    fireEvent.change(input("Peso de una unidad (g)"), {
      target: { value: "150" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Nuevo alimento" }),
      ).toBeNull(),
    );
    const post = server.calls.find(
      (c) => c.method === "POST" && c.url === "/api/foods",
    );
    expect(post?.body).toEqual({
      name: "Pechuga de pavo",
      kcal: 105,
      protein: 24,
      fat: 1,
      carbs: 0,
      gramsPerUnit: 150,
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Ingrediente 2 unidad" }),
      {
        target: { value: "ud" },
      },
    );
    expect(screen.getByText("Cuenta como «Pechuga de pavo»")).toBeDefined();
    const created = server.foods.find((f) => f.name === "Pechuga de pavo");
    const body = await save(server);
    expect(body.ingredients[1]).toMatchObject({
      food: "Pechuga de pavo",
      foodId: created?.id,
    });
  });

  it("un nombre repetido muestra el error en el diálogo y no enlaza nada", async () => {
    const server = makeServer([recipe]);
    await openEditor(server);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Crear alimento para el ingrediente 2",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Nuevo alimento" });
    fireEvent.change(within(dialog).getByLabelText("Nombre"), {
      target: { value: "Ajo" },
    });
    for (const label of [
      "Calorías (por 100 g)",
      "Proteínas (g)",
      "Grasas (g)",
      "Carbohidratos (g)",
    ])
      fireEvent.change(within(dialog).getByLabelText(label), {
        target: { value: "1" },
      });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear" }));
    expect(
      await within(dialog).findByText("Ya existe un alimento con ese nombre"),
    ).toBeDefined();
  });

  it("enlaza sin fijarse en mayúsculas, tildes ni espacios", async () => {
    const server = makeServer([recipe]);
    await openEditor(server);
    await screen.findByText("Cuenta como «Arroz»");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Ingrediente 1 alimento" }),
      { target: { value: " ÁRROZ " } },
    );
    expect(screen.getByText("Cuenta como «Arroz»")).toBeDefined();
    const body = await save(server);
    expect(body.ingredients[0]).toMatchObject({ foodId: 5 });
  });

  it("avisa si la unidad no se puede pasar a gramos aunque esté enlazado", async () => {
    await openEditor(makeServer([recipe]));
    // ajo: 1 «diente», enlazado a «Ajo» (que sí tiene peso por unidad, pero en «ud»)
    expect(
      await screen.findByText("No cuenta: «diente» no se puede pasar a gramos"),
    ).toBeDefined();
  });

  it("marcar un ingrediente como opcional viaja en el PUT", async () => {
    const server = makeServer([recipe]);
    await openEditor(server);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Ingrediente 2 opcional" }),
    );
    const body = await save(server);
    expect(body.ingredients[1].optional).toBe(true);
    expect(body.ingredients[2].optional).toBe(true);
  });
});
