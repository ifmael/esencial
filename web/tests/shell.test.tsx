// UI tests: shell navigation (active state, deep links) + Día empty states.
// E7: App now checks /api/auth/status on mount — stub it as authenticated.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/app";

beforeAll(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ authenticated: true })));
});
afterEach(cleanup);

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("Shell", () => {
  it("marks the active route with aria-current", async () => {
    renderAt("/plan-recetas");
    // E7 guard: the shell appears once /api/auth/status resolves.
    await waitFor(() => expect(screen.getAllByText("Plan recetas").length).toBeGreaterThan(0));
    const links = screen.getAllByText("Plan recetas");
    expect(links.some((el) => el.getAttribute("aria-current") === "page")).toBe(true);
    expect(
      screen.getAllByText("Hoy").every((el) => el.getAttribute("aria-current") !== "page"),
    ).toBe(true);
  });

  it("navigates between tabs client-side", async () => {
    renderAt("/");
    await waitFor(() => expect(screen.getAllByText("Plan fuerza").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("Plan fuerza")[0]);
    expect(window.location.pathname).toBe("/plan-fuerza");
    expect(screen.getByText("Plantillas rotatorias — llegan en E4.")).toBeDefined();
  });
});

describe("Día placeholder", () => {
  it("renders navigable date header and three empty sections", async () => {
    renderAt("/");
    await waitFor(() => expect(screen.getByText("FUERZA")).toBeDefined());
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
