// UI tests: shell navigation (active state, deep links) + Día sections.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/app";
import type { DayData } from "../src/lib/day";

afterEach(cleanup);

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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

describe("Día (E5)", () => {
  beforeEach(() => {
    const empty: DayData = {
      date: localToday(),
      isoWeek: "2026-W36",
      dayIndex: 2,
      meals: [],
      session: null,
      note: { text: "" },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      Response.json({ ...empty, date: String(url).slice("/api/day/".length) }),
    ));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders navigable date header and three sections", async () => {
    renderAt("/");
    const before = screen.getByRole("heading", { level: 1 }).textContent;
    expect(before).toMatch(/^Hoy/); // abre en la fecha local
    fireEvent.click(screen.getByRole("button", { name: "Día siguiente" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).not.toBe(before),
    );
    await waitFor(() => expect(screen.getByText("RECETA")).toBeDefined());
    expect(screen.getByText("Aún no has planificado comidas para este día")).toBeDefined();
    expect(screen.getByText("FUERZA")).toBeDefined();
    expect(screen.getByText("Sin sesión asignada")).toBeDefined();
    expect(screen.getByText("NOTAS DEL DÍA")).toBeDefined();
  });
});
