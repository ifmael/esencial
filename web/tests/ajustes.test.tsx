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
import { mockApi } from "./api-mock";

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const themeGroup = async () =>
  within(await screen.findByRole("group", { name: "Tema" }));

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
