// UI tests: shell navigation (active state, deep links) + Día empty states.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../src/app";

afterEach(cleanup);

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("Shell", () => {
  it("marks the active route with aria-current", () => {
    renderAt("/plan-recetas");
    const links = screen.getAllByText("Plan recetas");
    expect(links.some((el) => el.getAttribute("aria-current") === "page")).toBe(true);
    expect(
      screen.getAllByText("Hoy").every((el) => el.getAttribute("aria-current") !== "page"),
    ).toBe(true);
  });

  it("navigates between tabs client-side", () => {
    renderAt("/");
    fireEvent.click(screen.getAllByText("Plan fuerza")[0]);
    expect(window.location.pathname).toBe("/plan-fuerza");
    expect(screen.getByText("Plantillas rotatorias — llegan en E4.")).toBeDefined();
  });
});

describe("Día placeholder", () => {
  it("renders navigable date header and three empty sections", () => {
    renderAt("/");
    const before = screen.getByRole("heading", { level: 1 }).textContent;
    expect(before).toMatch(/de/); // es-ES long date
    fireEvent.click(screen.getByRole("button", { name: "Día siguiente" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toBe(before);
    expect(screen.getByText("RECETA")).toBeDefined();
    expect(screen.getByText("No hay comidas planificadas para este día.")).toBeDefined();
    expect(screen.getByText("FUERZA")).toBeDefined();
    expect(screen.getByText("Sin sesión asignada.")).toBeDefined();
    expect(screen.getByText("NOTAS DEL DÍA")).toBeDefined();
    expect(screen.getByText("Escribe algo sobre hoy…")).toBeDefined();
  });
});
