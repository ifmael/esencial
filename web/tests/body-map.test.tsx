// Mapa muscular: contrato que consume el selector de ejercicios (un botón por
// sub-región muscular — las dos mitades, izquierda y derecha, comparten uno —,
// `aria-pressed` del elegido, selección con ratón y teclado) e integridad del
// asset: cada músculo del dibujo tiene nombre en español, grupo válido y una
// sub-región filtrable.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BodyMap } from "../src/components/body-map/body-map";
import {
  BACK_REGIONS,
  type BodyRegion,
  FRONT_REGIONS,
} from "../src/components/body-map/data";
import {
  canonicalRegionId,
  MUSCLE_REGIONS,
} from "../src/components/body-map/regions";
import { GROUP_LABELS } from "../src/components/grouped-exercises";

afterEach(cleanup);

const ALL_REGIONS: BodyRegion[] = [...FRONT_REGIONS, ...BACK_REGIONS];

describe("BodyMap", () => {
  it("ofrece un botón por músculo de la vista y marca el elegido", () => {
    const { unmount } = render(
      <BodyMap view="front" region="chest-lower" onSelect={() => {}} />,
    );
    // Dos piezas (izquierda y derecha) del mismo músculo, un solo botón.
    expect(screen.getAllByRole("button")).toHaveLength(
      new Set(
        FRONT_REGIONS.filter((r) => r.tag).map((r) => canonicalRegionId(r.id)),
      ).size,
    );
    expect(
      screen
        .getByRole("button", { name: "Pecho inferior (esternal)" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Pecho superior (clavicular)" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    // El sóleo solo está en la vista trasera: no se ofrece en la frontal.
    expect(screen.queryByRole("button", { name: "Sóleo" })).toBeNull();
    unmount();

    render(<BodyMap view="back" region="calves-soleus" onSelect={() => {}} />);
    expect(
      screen
        .getByRole("button", { name: "Sóleo" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.queryByRole("button", { name: "Pecho inferior (esternal)" }),
    ).toBeNull();
  });

  it("selecciona con ratón y con Enter o espacio, y solo con esas teclas", () => {
    const onSelect = vi.fn();
    render(<BodyMap view="front" region={null} onSelect={onSelect} />);
    const quads = screen.getByRole("button", { name: "Cuádriceps" });
    fireEvent.click(quads);
    fireEvent.keyDown(quads, { key: "Enter" });
    fireEvent.keyDown(quads, { key: " " });
    fireEvent.keyDown(quads, { key: "a" });
    expect(onSelect.mock.calls.map(([id]) => id)).toEqual([
      "quads",
      "quads",
      "quads",
    ]);
  });

  it("cada músculo del dibujo tiene nombre, grupo y sub-región filtrable", () => {
    for (const region of ALL_REGIONS) {
      expect(region.label.trim().length, region.id).toBeGreaterThan(0);
      expect(region.path.length, region.id).toBeGreaterThan(0);
      if (region.tag === null) continue;
      expect(Object.keys(GROUP_LABELS), region.id).toContain(region.tag);
      // El músculo que se pinta es el que se filtra: misma sub-región y grupo.
      const canonical = MUSCLE_REGIONS.find(
        (r) => r.id === canonicalRegionId(region.id),
      );
      expect(canonical?.group, region.id).toBe(region.tag);
    }
  });

  it("los diez grupos son alcanzables entre las dos vistas", () => {
    const reachable = new Set(
      ALL_REGIONS.map((r) => r.tag).filter((tag) => tag !== null),
    );
    expect([...reachable].sort()).toEqual(Object.keys(GROUP_LABELS).sort());
  });
});
