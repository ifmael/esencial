// Mapa corporal: contrato que consume el selector de ejercicios (un botón por
// grupo muscular, `aria-pressed` del elegido, selección con ratón y teclado) e
// integridad del asset: cada músculo tiene nombre en español y grupo válido, y
// los diez grupos de la taxonomía son alcanzables entre las dos vistas.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BodyMap } from "../src/components/body-map/body-map";
import {
  BACK_REGIONS,
  type BodyRegion,
  FRONT_REGIONS,
} from "../src/components/body-map/data";
import { GROUP_LABELS } from "../src/components/grouped-exercises";

afterEach(cleanup);

const ALL_REGIONS: BodyRegion[] = [...FRONT_REGIONS, ...BACK_REGIONS];

describe("BodyMap", () => {
  it("ofrece un botón por grupo de la vista y marca el elegido", () => {
    const { unmount } = render(
      <BodyMap view="front" group="pecho" onSelect={() => {}} />,
    );
    expect(
      screen
        .getByRole("button", { name: "Pecho" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Core" }).getAttribute("aria-pressed"),
    ).toBe("false");
    // El gemelo solo está en la vista trasera: no se ofrece en la frontal.
    expect(screen.queryByRole("button", { name: "Gemelo" })).toBeNull();
    unmount();

    render(<BodyMap view="back" group="pecho" onSelect={() => {}} />);
    expect(
      screen
        .getByRole("button", { name: "Gemelo" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.queryByRole("button", { name: "Pecho" })).toBeNull();
  });

  it("selecciona con ratón y con Enter o espacio, y solo con esas teclas", () => {
    const onSelect = vi.fn();
    render(<BodyMap view="back" group={null} onSelect={onSelect} />);
    const pierna = screen.getByRole("button", { name: "Pierna" });
    fireEvent.click(pierna);
    fireEvent.keyDown(pierna, { key: "Enter" });
    fireEvent.keyDown(pierna, { key: " " });
    fireEvent.keyDown(pierna, { key: "a" });
    expect(onSelect.mock.calls.map(([tag]) => tag)).toEqual([
      "pierna",
      "pierna",
      "pierna",
    ]);
  });

  it("cada músculo tiene nombre y un grupo de la taxonomía (o ninguno)", () => {
    for (const region of ALL_REGIONS) {
      expect(region.label.trim().length, region.id).toBeGreaterThan(0);
      expect(region.path.length, region.id).toBeGreaterThan(0);
      if (region.tag !== null) {
        expect(Object.keys(GROUP_LABELS), region.id).toContain(region.tag);
      }
    }
  });

  it("los diez grupos son alcanzables entre las dos vistas", () => {
    const reachable = new Set(
      ALL_REGIONS.map((r) => r.tag).filter((tag) => tag !== null),
    );
    expect([...reachable].sort()).toEqual(Object.keys(GROUP_LABELS).sort());
  });
});
