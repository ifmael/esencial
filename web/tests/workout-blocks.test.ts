// Reglas puras de los bloques (superseries): qué ejercicios van pegados, cómo
// se normalizan las marcas y qué toca tras marcar una serie en el modo sesión.
import { describe, expect, it } from "vitest";
import {
  type BlockRow,
  blockLabel,
  blockRange,
  blocks,
  nextAfterSet,
  normalizeSupersets,
  type StepItem,
} from "../src/lib/workout";

describe("blockRange / blocks", () => {
  it("un ejercicio suelto es un bloque de uno", () => {
    const rows: BlockRow[] = [
      { superset: false, kind: "strength" },
      { superset: false, kind: "strength" },
    ];
    expect(blockRange(rows, 0)).toEqual([0, 0]);
    expect(blockRange(rows, 1)).toEqual([1, 1]);
    expect(blocks(rows)).toEqual([[0], [1]]);
  });

  it("una superserie agrupa los dos y una triserie los tres", () => {
    const rows: BlockRow[] = [
      { superset: true, kind: "strength" },
      { superset: false, kind: "strength" },
      { superset: true, kind: "strength" },
      { superset: true, kind: "strength" },
      { superset: false, kind: "strength" },
    ];
    expect(blockRange(rows, 0)).toEqual([0, 1]);
    expect(blockRange(rows, 2)).toEqual([2, 4]);
    expect(blocks(rows)).toEqual([
      [0, 1],
      [2, 3, 4],
    ]);
  });
});

describe("normalizeSupersets", () => {
  it("deja intacto un bloque válido", () => {
    const rows = [
      { superset: true, kind: "strength" as const },
      { superset: false, kind: "strength" as const },
    ];
    expect(normalizeSupersets(rows)).toEqual(rows);
  });

  it("apaga la marca de la última fila (no tiene siguiente)", () => {
    const rows = [{ superset: true, kind: "strength" as const }];
    expect(normalizeSupersets(rows)).toEqual([
      { superset: false, kind: "strength" },
    ]);
  });

  it("no encadena hacia un cardio", () => {
    const rows = [
      { superset: true, kind: "strength" as const },
      { superset: false, kind: "running" as const },
    ];
    expect(normalizeSupersets(rows)[0].superset).toBe(false);
  });

  it("el cardio no encadena", () => {
    const rows = [
      { superset: true, kind: "running" as const },
      { superset: false, kind: "strength" as const },
    ];
    expect(normalizeSupersets(rows)[0].superset).toBe(false);
  });

  it("no muta la lista original", () => {
    const rows = [{ superset: true, kind: "strength" as const }];
    normalizeSupersets(rows);
    expect(rows[0].superset).toBe(true);
  });
});

describe("blockLabel", () => {
  it("nombra el bloque por su tamaño", () => {
    expect(blockLabel(2)).toBe("Superserie");
    expect(blockLabel(3)).toBe("Triserie");
    expect(blockLabel(4)).toBe("Serie gigante");
    expect(blockLabel(5)).toBe("Serie gigante");
  });
});

describe("nextAfterSet — serie recta", () => {
  it("queda serie por hacer y hay descanso: pausa entre series", () => {
    const items: StepItem[] = [
      {
        kind: "strength",
        superset: false,
        sets: [{ done: true }, { done: false }],
        restSecs: 90,
        restAfterSecs: 150,
      },
    ];
    expect(nextAfterSet(items, 0, 0)).toEqual({
      kind: "pause",
      pause: "sets",
      seconds: 90,
      owner: 0,
    });
  });

  it("queda serie por hacer y no hay descanso: se queda donde está", () => {
    const items: StepItem[] = [
      {
        kind: "strength",
        superset: false,
        sets: [{ done: true }, { done: false }],
        restSecs: null,
        restAfterSecs: 150,
      },
    ];
    expect(nextAfterSet(items, 0, 0)).toEqual({ kind: "stay" });
  });

  it("marcar la última serie (aunque las de antes no estén) arranca la de fin", () => {
    const withRest: StepItem[] = [
      {
        kind: "strength",
        superset: false,
        sets: [{ done: false }, { done: false }, { done: true }],
        restSecs: 90,
        restAfterSecs: 150,
      },
      {
        kind: "strength",
        superset: false,
        sets: [{ done: false }],
        restSecs: null,
        restAfterSecs: null,
      },
    ];
    expect(nextAfterSet(withRest, 0, 2)).toEqual({
      kind: "pause",
      pause: "after",
      seconds: 150,
      owner: 0,
    });
    const noRest: StepItem[] = [
      { ...withRest[0], restAfterSecs: null },
      withRest[1],
    ];
    expect(nextAfterSet(noRest, 0, 2)).toEqual({ kind: "move", to: 1 });
  });

  it("el último ejercicio de la sesión termina (corta la pausa)", () => {
    const items: StepItem[] = [
      {
        kind: "strength",
        superset: false,
        sets: [{ done: true }],
        restSecs: null,
        restAfterSecs: 150,
      },
    ];
    expect(nextAfterSet(items, 0, 0)).toEqual({ kind: "end" });
  });
});

describe("nextAfterSet — bloque", () => {
  const block = (): StepItem[] => [
    {
      kind: "strength",
      superset: true,
      sets: [{ done: true }, { done: false }, { done: false }],
      restSecs: null,
      restAfterSecs: null,
    },
    {
      kind: "strength",
      superset: false,
      sets: [{ done: false }, { done: false }, { done: false }],
      restSecs: 90,
      restAfterSecs: 150,
    },
  ];

  it("a mitad de vuelta pasa al siguiente miembro sin pausa", () => {
    expect(nextAfterSet(block(), 0, 0)).toEqual({ kind: "move", to: 1 });
  });

  it("cierra la vuelta: pausa entre vueltas y vuelve al primero", () => {
    const items = block();
    items[1] = {
      ...items[1],
      sets: [{ done: true }, { done: false }, { done: false }],
    };
    expect(nextAfterSet(items, 1, 0)).toEqual({
      kind: "pause",
      pause: "sets",
      seconds: 90,
      owner: 1,
    });
  });

  it("sin descanso entre vueltas, vuelve sin pausa", () => {
    const items = block();
    items[1] = {
      ...items[1],
      sets: [{ done: true }, { done: false }, { done: false }],
      restSecs: null,
    };
    expect(nextAfterSet(items, 1, 0)).toEqual({ kind: "move", to: 0 });
  });

  it("bloque terminado con algo detrás: pausa de fin y sigue", () => {
    const items: StepItem[] = [
      {
        kind: "strength",
        superset: true,
        sets: [{ done: true }],
        restSecs: null,
        restAfterSecs: null,
      },
      {
        kind: "strength",
        superset: false,
        sets: [{ done: true }],
        restSecs: 90,
        restAfterSecs: 150,
      },
      {
        kind: "strength",
        superset: false,
        sets: [{ done: false }],
        restSecs: null,
        restAfterSecs: null,
      },
    ];
    expect(nextAfterSet(items, 1, 0)).toEqual({
      kind: "pause",
      pause: "after",
      seconds: 150,
      owner: 1,
    });
  });

  it("series desiguales: sigue la vuelta del miembro que la tiene", () => {
    // A hace 3 series y lleva 2; B solo hace 2 y le toca la suya.
    const items: StepItem[] = [
      {
        kind: "strength",
        superset: true,
        sets: [{ done: true }, { done: true }, { done: false }],
        restSecs: null,
        restAfterSecs: null,
      },
      {
        kind: "strength",
        superset: false,
        sets: [{ done: true }, { done: false }],
        restSecs: 90,
        restAfterSecs: 150,
      },
    ];
    expect(nextAfterSet(items, 0, 1)).toEqual({ kind: "move", to: 1 });
  });

  it("series desiguales: el miembro agotado se salta al cerrar la vuelta", () => {
    // A hace 3 series y lleva 2; B solo tiene una (ya hecha): vuelve A.
    const items: StepItem[] = [
      {
        kind: "strength",
        superset: true,
        sets: [{ done: true }, { done: true }, { done: false }],
        restSecs: null,
        restAfterSecs: null,
      },
      {
        kind: "strength",
        superset: false,
        sets: [{ done: true }],
        restSecs: 90,
        restAfterSecs: 150,
      },
    ];
    expect(nextAfterSet(items, 0, 1)).toEqual({
      kind: "pause",
      pause: "sets",
      seconds: 90,
      owner: 1,
    });
  });

  it("el bloque es lo último de la sesión: termina", () => {
    const items: StepItem[] = [
      {
        kind: "strength",
        superset: true,
        sets: [{ done: true }],
        restSecs: null,
        restAfterSecs: null,
      },
      {
        kind: "strength",
        superset: false,
        sets: [{ done: true }],
        restSecs: 90,
        restAfterSecs: 150,
      },
    ];
    expect(nextAfterSet(items, 1, 0)).toEqual({ kind: "end" });
  });
});
