// Escenario del mapa muscular: conmutador 2D/3D sobre el SVG accesible. El
// contrato: el SVG sigue siendo la capa de botones (también en 3D), la
// selección es el mismo estado en las dos capas, y el 3D solo se ofrece con
// WebGL y sin `prefers-reduced-motion`.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BodyMap } from "../src/components/body-map/body-map";
import { BodyMapStage } from "../src/components/body-map/stage";

// La escena real (three + WebGL) no corre en jsdom: se sustituye por una marca
// que enseña lo que recibe.
vi.mock("../src/components/body-map/body-map-3d", () => ({
  default: (p: { regions: string[]; focused: string | null }) => (
    <div data-testid="scene-3d">
      {p.regions.join(",")}|{p.focused ?? ""}
    </div>
  ),
}));

function stubEnv({ webgl, reduce }: { webgl: boolean; reduce: boolean }) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() =>
    webgl ? {} : null) as never);
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduce && q.includes("prefers-reduced-motion"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

function Picker({ onSelect = () => {} }: { onSelect?: (id: string) => void }) {
  return (
    <BodyMapStage view="front" regions={["chest-lower"]} onSelect={onSelect}>
      <BodyMap view="front" regions={["chest-lower"]} onSelect={onSelect} />
    </BodyMapStage>
  );
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* sin almacenamiento: el conmutador funciona igual, sin recordar */
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BodyMapStage", () => {
  it("arranca en 2D, con el SVG visible y el conmutador disponible", () => {
    stubEnv({ webgl: true, reduce: false });
    render(<Picker />);
    expect(
      screen.getByRole("button", { name: "2D" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByTestId("scene-3d")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Pecho inferior (esternal)" }),
    ).toBeTruthy();
  });

  it("sin WebGL no ofrece el 3D", () => {
    stubEnv({ webgl: false, reduce: false });
    render(<Picker />);
    expect(screen.queryByRole("button", { name: "3D" })).toBeNull();
  });

  it("con movimiento reducido no ofrece el 3D", () => {
    stubEnv({ webgl: true, reduce: true });
    render(<Picker />);
    expect(screen.queryByRole("button", { name: "3D" })).toBeNull();
  });

  it("en 3D los músculos siguen siendo botones del SVG y eligen lo mismo", async () => {
    stubEnv({ webgl: true, reduce: false });
    const onSelect = vi.fn();
    render(<Picker onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "3D" }));

    const scene = await screen.findByTestId("scene-3d");
    // La escena recibe la misma selección que el SVG.
    expect(scene.textContent).toContain("chest-lower");
    const muscle = screen.getByRole("button", {
      name: "Pecho inferior (esternal)",
    });
    expect(muscle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Bíceps" }));
    expect(onSelect).toHaveBeenCalledWith("biceps");
  });

  it("el foco de teclado en un músculo lo resalta en la escena 3D", async () => {
    stubEnv({ webgl: true, reduce: false });
    render(<Picker />);
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    await screen.findByTestId("scene-3d");
    fireEvent.focus(screen.getByRole("button", { name: "Bíceps" }));
    expect(screen.getByTestId("scene-3d").textContent).toMatch(/\|biceps$/);
  });

  it("recuerda la elección al volver a montar", async () => {
    stubEnv({ webgl: true, reduce: false });
    const { unmount } = render(<Picker />);
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    await screen.findByTestId("scene-3d");
    unmount();
    render(<Picker />);
    expect(await screen.findByTestId("scene-3d")).toBeTruthy();
  });
});
