// El catálogo es la referencia viva del sistema: si una variante desaparece de
// aquí, deja de existir para quien mira antes de inventar una pieza.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UiPage } from "../src/routes/ui";

afterEach(cleanup);

describe("catálogo del sistema de diseño", () => {
  it("expone todas las variantes y tamaños de botón", () => {
    render(<UiPage />);
    for (const name of [
      "Primario",
      "Secundario",
      "Fantasma",
      "Peligro",
      "Deshabilitado",
      "Pequeño",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("expone el chip encendido y apagado, la tecla y el aviso", () => {
    render(<UiPage />);
    const pressed = (name: string) =>
      screen.getByRole("button", { name }).getAttribute("aria-pressed");
    expect(pressed("Activo")).toBe("true");
    expect(pressed("Inactivo")).toBe("false");
    expect(document.querySelector("kbd")).toBeTruthy();
    // Muestra estática: se ve, pero no se anuncia en cada visita.
    expect(screen.getByText(/No se pudo guardar/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("expone los tres tonos de insignia", () => {
    render(<UiPage />);
    for (const tone of ["Pendiente", "Hecho", "Neutro"]) {
      expect(screen.getByText(tone)).toBeTruthy();
    }
  });

  it("expone los seis pasos de la escala tipográfica", () => {
    render(<UiPage />);
    for (const token of [
      "text-display",
      "text-title",
      "text-lead",
      "text-body",
      "text-caption",
      "text-micro",
    ]) {
      expect(document.querySelector(`.${token}`)).toBeTruthy();
    }
  });

  it("expone los campos con su piel, incluido el selector", () => {
    render(<UiPage />);
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Área de texto" })).toBeTruthy();
  });

  it("expone los quince iconos", () => {
    render(<UiPage />);
    const set = screen.getByTestId("icon-set");
    expect(set.querySelectorAll("svg")).toHaveLength(15);
  });
});
