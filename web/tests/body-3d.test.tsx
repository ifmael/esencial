// Visor 3D de los músculos: lo que se puede comprobar sin GPU. jsdom no tiene
// WebGL, así que la escena (three) se sustituye y aquí se prueba el contrato
// del componente: el respaldo SVG cuando no hay WebGL o la escena falla, y el
// nombre accesible, que es lo único que un lector de pantalla recibe del lienzo.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Body3D } from "../src/components/body-3d/body-3d";

const mount = vi.hoisted(() => vi.fn());
vi.mock("../src/components/body-3d/scene", () => ({ mountScene: mount }));

const handle = { paint: vi.fn(), view: vi.fn(), dispose: vi.fn() };
const regions = [
  { region: "chest-lower", role: "primary" as const },
  { region: "triceps-lateral", role: "secondary" as const },
];

const loseContext = vi.fn();

function withWebGL() {
  vi.stubGlobal("WebGL2RenderingContext", class {});
  const gl = {
    getExtension: (name: string) =>
      name === "WEBGL_lose_context" ? { loseContext } : null,
  } as never;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mount.mockReset();
});

describe("Body3D", () => {
  it("sin WebGL pinta el respaldo y no carga la escena", () => {
    render(<Body3D regions={regions} fallback={<p>dibujo SVG</p>} />);
    expect(screen.getByText("dibujo SVG")).toBeDefined();
    expect(mount).not.toHaveBeenCalled();
  });

  it("suelta el contexto de prueba: Chrome limita los contextos WebGL vivos", async () => {
    withWebGL();
    loseContext.mockClear();
    mount.mockResolvedValue(handle);
    render(<Body3D regions={regions} fallback={<p>dibujo SVG</p>} />);
    await screen.findByRole("img");
    expect(loseContext).toHaveBeenCalled();
  });

  it("si la escena no carga (modelo o GPU), vuelve al respaldo", async () => {
    withWebGL();
    mount.mockRejectedValue(new Error("sin modelo"));
    render(<Body3D regions={regions} fallback={<p>dibujo SVG</p>} />);
    expect(await screen.findByText("dibujo SVG")).toBeDefined();
  });

  it("de solo lectura se nombra con cada músculo y su grado", async () => {
    withWebGL();
    mount.mockResolvedValue(handle);
    render(<Body3D regions={regions} fallback={<p>dibujo SVG</p>} />);
    expect(
      await screen.findByRole("img", {
        name: "Músculos: Pecho inferior (esternal), principal; Tríceps (cabeza lateral), secundario",
      }),
    ).toBeDefined();
    expect(screen.queryByText("dibujo SVG")).toBeNull();
  });
});
