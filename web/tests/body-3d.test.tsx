// Visor 3D de los músculos: lo que se puede comprobar sin GPU. jsdom no tiene
// WebGL, así que la escena (three) se sustituye y aquí se prueba el contrato
// del componente: el respaldo SVG cuando no hay WebGL o la escena falla, y el
// nombre accesible, que es lo único que un lector de pantalla recibe del lienzo.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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

/** WebGL con el renderizador indicado; `null` = el navegador no lo revela
 *  (Firefox con `resistFingerprinting`, algunos Safari). */
function withWebGL(
  renderer: string | null = "ANGLE (Apple, ANGLE Metal Renderer: Apple M2)",
) {
  vi.stubGlobal("WebGL2RenderingContext", class {});
  const info = { UNMASKED_RENDERER_WEBGL: 0x9246 };
  const gl = {
    getExtension: (name: string) =>
      name === "WEBGL_lose_context"
        ? { loseContext }
        : name === "WEBGL_debug_renderer_info" && renderer !== null
          ? info
          : null,
    getParameter: (p: number) =>
      p === info.UNMASKED_RENDERER_WEBGL ? renderer : null,
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

  it("sin WebGL, la leyenda sigue bajo el respaldo", () => {
    render(
      <Body3D
        regions={regions}
        legend={<p>leyenda</p>}
        fallback={<p>dibujo SVG</p>}
      />,
    );
    expect(screen.getByText("leyenda")).toBeDefined();
  });

  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "Microsoft Basic Render Driver",
  ])(
    "sin GPU (%s) pinta el respaldo: por software el 3D congela la página",
    (renderer) => {
      withWebGL(renderer);
      render(<Body3D regions={regions} fallback={<p>dibujo SVG</p>} />);
      expect(screen.getByText("dibujo SVG")).toBeDefined();
      expect(mount).not.toHaveBeenCalled();
    },
  );

  it("si el navegador no revela el renderizador, se fía y pinta el 3D", async () => {
    withWebGL(null);
    mount.mockResolvedValue(handle);
    render(<Body3D regions={regions} fallback={<p>dibujo SVG</p>} />);
    expect(
      await screen.findByRole("img", { name: /^Músculos:/ }),
    ).toBeDefined();
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

  it("un tooltip nombra el músculo bajo el cursor, también de solo lectura", async () => {
    withWebGL();
    mount.mockResolvedValue(handle);
    render(<Body3D regions={regions} fallback={<p>dibujo SVG</p>} />);
    await screen.findByRole("img");
    const opts = mount.mock.calls[0][1];
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => opts.onHover("chest-lower", 40, 60));
    expect(screen.getByRole("tooltip").textContent).toBe(
      "Pecho inferior (esternal)",
    );
    act(() => opts.onHover(null, 0, 0));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("tras girar o acercar, «Restablecer vista» vuelve a la vista de partida", async () => {
    withWebGL();
    mount.mockResolvedValue(handle);
    handle.view.mockClear();
    render(
      <Body3D regions={regions} view="back" fallback={<p>dibujo SVG</p>} />,
    );
    await screen.findByRole("img");
    expect(
      screen.queryByRole("button", { name: "Restablecer vista" }),
    ).toBeNull();
    act(() => mount.mock.calls[0][1].onMoved());
    fireEvent.click(screen.getByRole("button", { name: "Restablecer vista" }));
    expect(handle.view).toHaveBeenCalledTimes(2);
    expect(handle.view).toHaveBeenLastCalledWith("back");
    expect(
      screen.queryByRole("button", { name: "Restablecer vista" }),
    ).toBeNull();
  });
});
