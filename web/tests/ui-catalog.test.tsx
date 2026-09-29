// El catálogo es la referencia viva del sistema: si una variante desaparece de
// aquí, deja de existir para quien mira antes de inventar una pieza.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import * as icons from "../src/components/icons";
import { SnackbarHost } from "../src/components/overlay";
import { SHAPES } from "../src/lib/shapes";
import { UiPage } from "../src/routes/ui";

afterEach(cleanup);

const renderUi = () =>
  render(
    <SnackbarHost>
      <UiPage />
    </SnackbarHost>,
  );

describe("catálogo del sistema de diseño", () => {
  it("expone las cinco variantes de botón, los tamaños y el deshabilitado", () => {
    renderUi();
    for (const name of [
      "Filled",
      "Tonal",
      "Outlined",
      "Text",
      "Destructivo",
      "Deshabilitado",
      "Pequeño",
      "Grande",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("expone los cuatro tonos de insignia", () => {
    renderUi();
    for (const tone of ["Pendiente", "Hecho", "Neutro", "Sección"]) {
      expect(screen.getByText(tone)).toBeTruthy();
    }
  });

  it("expone la escala tipográfica M3 completa", () => {
    renderUi();
    for (const role of ["display", "headline", "title", "body", "label"])
      for (const size of ["l", "m", "s"])
        expect(
          document.querySelector(`.text-${role}-${size}`),
          `${role}-${size}`,
        ).toBeTruthy();
  });

  it("expone los campos: outlined con etiqueta flotante, error, selector y área", () => {
    renderUi();
    expect(screen.getByLabelText("Nombre de la receta")).toBeTruthy();
    const withError = screen.getByLabelText("Raciones");
    expect(withError.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Comida" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Notas" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Casilla" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Interruptor" })).toBeTruthy();
  });

  it("el grupo conectado marca la opción elegida con aria-pressed", () => {
    renderUi();
    const group = screen.getByRole("group", { name: "Vista" });
    const semana = within(group).getByRole("button", { name: "Semana" });
    fireEvent.click(semana);
    expect(semana.getAttribute("aria-pressed")).toBe("true");
    expect(
      within(group)
        .getByRole("button", { name: "Día" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("expone todas las formas M3E y todos los iconos", () => {
    renderUi();
    expect(
      screen.getByTestId("shape-set").querySelectorAll("svg"),
    ).toHaveLength(Object.keys(SHAPES).length);
    const iconCount = Object.keys(icons).filter((k) =>
      k.endsWith("Icon"),
    ).length;
    expect(screen.getByTestId("icon-set").querySelectorAll("svg")).toHaveLength(
      iconCount,
    );
  });

  it("el snackbar de muestra ofrece Deshacer", () => {
    renderUi();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar snackbar" }));
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.getByText(/deshecho/i)).toBeTruthy();
  });
});
