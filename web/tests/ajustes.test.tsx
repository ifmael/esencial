// Ajustes (/ajustes): el tema se elige aquí (sistema/claro/oscuro) y desde
// aquí se llega al catálogo /ui. El Shell ya no lleva conmutador de tema.
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
import type { FamilyUser } from "../src/lib/family";
import { mockApi } from "./api-mock";

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const themeGroup = async () =>
  within(await screen.findByRole("group", { name: "Tema" }));

// Cuentas de la familia falsa: yo (admin), Ana conmigo y Bea en otra familia.
const ADMIN: FamilyUser = {
  id: 1,
  email: "admin@esencial.test",
  role: "admin",
  familyId: 1,
  name: null,
};
const ANA: FamilyUser = {
  id: 2,
  email: "ana@example.com",
  role: "member",
  familyId: 1,
  name: null,
};
const BEA: FamilyUser = {
  id: 3,
  email: "bea@example.com",
  role: "member",
  familyId: 2,
  name: null,
};

describe("Ajustes", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    mockApi({ exercises: [] });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("elige el tema, lo aplica y lo recuerda", async () => {
    renderAt("/ajustes");
    const group = await themeGroup();
    expect(
      group
        .getByRole("button", { name: "Sistema" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(group.getByRole("button", { name: "Oscuro" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("esencial.theme")).toBe("dark");
    expect(
      group
        .getByRole("button", { name: "Oscuro" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      group
        .getByRole("button", { name: "Sistema" })
        .getAttribute("aria-pressed"),
    ).toBe("false");

    fireEvent.click(group.getByRole("button", { name: "Claro" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(group.getByRole("button", { name: "Sistema" }));
    expect(window.localStorage.getItem("esencial.theme")).toBeNull();
  });

  it("refleja el tema cambiado desde la paleta ⌘K", async () => {
    renderAt("/ajustes");
    const group = await themeGroup();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = within(
      await screen.findByRole("dialog", { name: /buscar/i }),
    ).getByRole("combobox");
    fireEvent.change(input, { target: { value: "cambiar tema" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(
        group
          .getByRole("button", { name: "Claro" })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
  });

  it("enlaza al sistema de diseño", async () => {
    renderAt("/ajustes");
    await themeGroup();
    fireEvent.click(screen.getByRole("link", { name: /Sistema de diseño/ }));
    await waitFor(() => expect(window.location.pathname).toBe("/ui"));
  });

  it("el Shell lleva a Ajustes y ya no tiene conmutador de tema", async () => {
    renderAt("/");
    await screen.findAllByText("Deporte");
    expect(screen.queryByRole("button", { name: /^Tema / })).toBeNull();
    fireEvent.click(screen.getAllByRole("link", { name: "Ajustes" })[0]);
    await waitFor(() => expect(window.location.pathname).toBe("/ajustes"));
    expect(screen.getByRole("heading", { name: "Ajustes" })).toBeDefined();
  });
});

describe("Familia en Ajustes", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const adminView = async () => {
    renderAt("/ajustes");
    // El encabezado sale antes que los datos: espera a la lista cargada.
    await screen.findByRole("list", { name: "Mi familia" });
  };

  const addEmail = (value: string) =>
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value },
    });

  it("un member no ve la tarjeta", async () => {
    const api = mockApi({ me: ANA, users: [ADMIN, ANA] });
    renderAt("/ajustes");
    await themeGroup();
    await waitFor(() =>
      expect(api.calls.some((c) => c.url === "/api/me")).toBe(true),
    );
    expect(screen.queryByRole("heading", { name: "Familia" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Añadir a mi familia" }),
    ).toBeNull();
    // La tarjeta ni siquiera pide la lista (el member recibe 403).
    expect(api.calls.some((c) => c.url === "/api/users")).toBe(false);
  });

  it("un admin la ve, con su familia, los de fuera y sin quitarse a sí mismo", async () => {
    mockApi({ me: ADMIN, users: [ADMIN, ANA, BEA] });
    await adminView();

    const family = within(screen.getByRole("list", { name: "Mi familia" }));
    const outside = within(
      screen.getByRole("list", { name: "Fuera de mi familia" }),
    );
    expect(family.getByText("admin@esencial.test")).toBeDefined();
    expect(family.getByText("ana@example.com")).toBeDefined();
    expect(family.getByText("Tú")).toBeDefined();
    expect(family.getByText("Administrador")).toBeDefined();
    expect(family.getAllByText("Miembro")).toHaveLength(1);
    expect(outside.getByText("bea@example.com")).toBeDefined();

    // Quitar solo se ofrece a los miembros de mi familia, nunca a mí.
    expect(
      family.getByRole("button", {
        name: "Quitar a ana@example.com de mi familia",
      }),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", {
        name: "Quitar a admin@esencial.test de mi familia",
      }),
    ).toBeNull();
    expect(outside.queryByRole("button", { name: /^Quitar/ })).toBeNull();
  });

  it("añadir llama al endpoint con mi familyId y refresca la lista", async () => {
    const api = mockApi({ me: ADMIN, users: [ADMIN, ANA, BEA] });
    await adminView();
    expect(
      within(
        screen.getByRole("list", { name: "Fuera de mi familia" }),
      ).getByText("bea@example.com"),
    ).toBeDefined();

    addEmail("bea@example.com");
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir a mi familia" }),
    );

    await waitFor(() =>
      expect(
        api.calls.find(
          (c) => c.method === "POST" && c.url === "/api/families/1/members",
        )?.body,
      ).toEqual({ email: "bea@example.com" }),
    );
    const family = within(
      await screen.findByRole("list", { name: "Mi familia" }),
    );
    await waitFor(() =>
      expect(family.queryByText("bea@example.com")).not.toBeNull(),
    );
    expect(
      screen.queryByRole("list", { name: "Fuera de mi familia" }),
    ).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Email" }).getAttribute("value"),
    ).toBe("");
  });

  it("el 409 de la API se enseña tal cual", async () => {
    mockApi({ me: ADMIN, users: [ADMIN, ANA] });
    await adminView();
    addEmail("ana@example.com");
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir a mi familia" }),
    );
    expect(await screen.findByText("Already a member")).toBeDefined();
  });

  it("el 404 de usuario inexistente se enseña tal cual", async () => {
    mockApi({ me: ADMIN, users: [ADMIN, ANA] });
    await adminView();
    addEmail("nadie@example.com");
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir a mi familia" }),
    );
    expect(await screen.findByText("Not found")).toBeDefined();
  });

  it("el 400 de email inválido se marca en el campo", async () => {
    mockApi({ me: ADMIN, users: [ADMIN, ANA] });
    await adminView();
    addEmail("no-es-un-email");
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir a mi familia" }),
    );
    const input = screen.getByRole("textbox", { name: "Email" });
    await waitFor(() =>
      expect(input.getAttribute("aria-invalid")).toBe("true"),
    );
    expect(screen.getByText("Invalid email")).toBeDefined();
  });

  it("quitar llama al endpoint y refresca la lista", async () => {
    const api = mockApi({ me: ADMIN, users: [ADMIN, ANA] });
    await adminView();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Quitar a ana@example.com de mi familia",
      }),
    );
    await waitFor(() =>
      expect(
        api.calls.find(
          (c) => c.method === "DELETE" && c.url === "/api/families/1/members/2",
        ),
      ).toBeDefined(),
    );
    const outside = within(
      await screen.findByRole("list", { name: "Fuera de mi familia" }),
    );
    await waitFor(() =>
      expect(outside.queryByText("ana@example.com")).not.toBeNull(),
    );
  });

  // Cerrar sesión es de Cloudflare Access: el enlace va a la ruta que atiende
  // Cloudflare (no a la app), y solo se enseña cuando Access está delante. Va
  // como botón, sin la flecha de las filas que navegan: hace, no lleva.
  it("con Access delante ofrece cerrar sesión, en la ruta de Cloudflare", async () => {
    mockApi({ access: true });
    await adminView();

    const salir = await screen.findByRole("link", { name: /Cerrar sesión/ });
    expect(salir.getAttribute("href")).toBe("/cdn-cgi/access/logout");
    expect(salir.className).toContain("btn-outlined");
    expect(salir.querySelector("svg")).toBeNull();
  });

  it("en local, sin Access, no ofrece cerrar sesión", async () => {
    mockApi({ access: false });
    await adminView();

    expect(screen.queryByRole("link", { name: /Cerrar sesión/ })).toBeNull();
  });
});

describe("Perfil en Ajustes", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const nameInput = () =>
    screen.getByRole("textbox", { name: "Nombre" }) as HTMLInputElement;

  const save = () => screen.getByRole("button", { name: "Guardar" });

  it("pinta el nombre guardado", async () => {
    mockApi({ me: { ...ADMIN, name: "Ismael R." } });
    renderAt("/ajustes");
    await waitFor(() => expect(nameInput().value).toBe("Ismael R."));
  });

  it("sin nombre, el campo va vacío", async () => {
    mockApi({ me: ADMIN });
    renderAt("/ajustes");
    await themeGroup();
    await waitFor(() => expect(nameInput().value).toBe(""));
  });

  it("guardar manda el PATCH con lo escrito y refresca", async () => {
    const api = mockApi({ me: ADMIN });
    renderAt("/ajustes");
    await waitFor(() => expect(nameInput().value).toBe(""));

    fireEvent.change(nameInput(), { target: { value: "  Pepe   G. " } });
    fireEvent.click(save());

    await waitFor(() =>
      expect(
        api.calls.find((c) => c.method === "PATCH" && c.url === "/api/me")
          ?.body,
      ).toEqual({ name: "  Pepe   G. " }),
    );
    // El PATCH devuelve el nombre normalizado y el hook relee /api/me.
    await waitFor(() => expect(nameInput().value).toBe("Pepe G."));
  });

  it("vaciar el campo borra el nombre", async () => {
    const api = mockApi({ me: { ...ADMIN, name: "Ismael" } });
    renderAt("/ajustes");
    await waitFor(() => expect(nameInput().value).toBe("Ismael"));

    fireEvent.change(nameInput(), { target: { value: "   " } });
    fireEvent.click(save());

    await waitFor(() =>
      expect(
        api.calls.find((c) => c.method === "PATCH" && c.url === "/api/me")
          ?.body,
      ).toEqual({ name: "   " }),
    );
    await waitFor(() => expect(nameInput().value).toBe(""));
  });

  it("el 400 del campo se marca con aria-invalid y su texto", async () => {
    mockApi({ me: ADMIN });
    renderAt("/ajustes");
    await waitFor(() => expect(nameInput().value).toBe(""));

    fireEvent.change(nameInput(), { target: { value: "x".repeat(61) } });
    fireEvent.click(save());

    await waitFor(() =>
      expect(nameInput().getAttribute("aria-invalid")).toBe("true"),
    );
    expect(
      screen.getByText("El nombre no puede superar los 60 caracteres"),
    ).toBeDefined();
  });

  it("la ve también un member (el nombre no es cosa de la familia)", async () => {
    mockApi({ me: ANA });
    renderAt("/ajustes");
    await themeGroup();
    expect(
      await screen.findByRole("textbox", { name: "Nombre" }),
    ).toBeDefined();
  });
});
