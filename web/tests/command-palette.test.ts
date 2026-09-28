import { describe, expect, it } from "vitest";
import {
  type Command,
  groupResults,
  moveActive,
  rankCommands,
  scoreMatch,
} from "../src/lib/command-palette";

const cmd = (
  label: string,
  group: Command["group"] = "Pantallas",
  extra: Partial<Command> = {},
): Command =>
  ({ id: label, label, group, href: "/", ...extra }) as Command;

describe("scoreMatch", () => {
  it("ignora mayúsculas y tildes", () => {
    expect(scoreMatch("nutricion", "Nutrición")).not.toBeNull();
    expect(scoreMatch("PRESS", "press banca")).not.toBeNull();
  });

  it("ordena: prefijo > inicio de palabra > subcadena > dispersa", () => {
    const prefix = scoreMatch("pre", "Press banca") ?? -1;
    const word = scoreMatch("ban", "Press banca") ?? -1;
    const sub = scoreMatch("anc", "Press banca") ?? -1;
    const fuzzy = scoreMatch("pbc", "Press banca") ?? -1;
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(sub);
    expect(sub).toBeGreaterThan(fuzzy);
    expect(fuzzy).toBeGreaterThan(0);
  });

  it("devuelve null si las letras no aparecen en orden", () => {
    expect(scoreMatch("zz", "Press banca")).toBeNull();
    expect(scoreMatch("acp", "pac")).toBeNull();
  });

  it("todas las palabras de la consulta deben casar", () => {
    expect(scoreMatch("press inc", "Press inclinado")).not.toBeNull();
    expect(scoreMatch("press sentadilla", "Press inclinado")).toBeNull();
  });
});

describe("rankCommands", () => {
  const commands: Command[] = [
    cmd("Recetas"),
    cmd("Nueva receta", "Acciones"),
    cmd("Crema de calabaza", "Recetas", { searchOnly: true }),
    cmd("Press banca", "Ejercicios", { searchOnly: true }),
    cmd("Plan de fuerza", "Pantallas", { keywords: ["deporte", "semana"] }),
  ];

  it("sin consulta enseña solo pantallas y acciones, en su orden", () => {
    expect(rankCommands(commands, "").map((c) => c.label)).toEqual([
      "Recetas",
      "Nueva receta",
      "Plan de fuerza",
    ]);
  });

  it("con consulta busca también recetas y ejercicios, mejor primero", () => {
    expect(rankCommands(commands, "rec").map((c) => c.label)).toEqual([
      "Recetas",
      "Nueva receta",
    ]);
    expect(rankCommands(commands, "calab").map((c) => c.label)).toEqual([
      "Crema de calabaza",
    ]);
  });

  it("las palabras clave casan, pero por debajo del nombre", () => {
    const list = [
      cmd("Plan de fuerza", "Pantallas", { keywords: ["deporte"] }),
      cmd("Deporte libre", "Ejercicios", { searchOnly: true }),
    ];
    expect(rankCommands(list, "deporte").map((c) => c.label)).toEqual([
      "Deporte libre",
      "Plan de fuerza",
    ]);
  });

  it("a igual puntuación manda el orden original (estable)", () => {
    const list = [cmd("Banco A"), cmd("Banco B")];
    expect(rankCommands(list, "banco").map((c) => c.label)).toEqual([
      "Banco A",
      "Banco B",
    ]);
  });

  it("recorta al límite", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      cmd(`Ejercicio ${i}`, "Ejercicios", { searchOnly: true }),
    );
    expect(rankCommands(many, "ejer", 8)).toHaveLength(8);
  });
});

describe("acciones", () => {
  it("una acción no navega: lleva su propio `run` y no tiene href", () => {
    const toggle = { id: "tema", label: "Cambiar tema", group: "Acciones", action: "theme" } as const;
    const ranked = rankCommands([toggle, cmd("Recetas")], "tema");
    expect(ranked[0]).toEqual(toggle);
    expect("href" in ranked[0]).toBe(false);
  });
});

describe("groupResults", () => {
  it("agrupa en el orden de aparición; el índice sigue el orden visual (↑/↓)", () => {
    const list = [cmd("A", "Pantallas"), cmd("B", "Recetas", { searchOnly: true }), cmd("C", "Pantallas")];
    expect(
      groupResults(list).map((g) => [g.group, g.items.map((x) => [x.command.label, x.index])]),
    ).toEqual([
      ["Pantallas", [["A", 0], ["C", 1]]],
      ["Recetas", [["B", 2]]],
    ]);
  });
});

describe("moveActive", () => {
  it("avanza y retrocede dando la vuelta", () => {
    expect(moveActive(0, 1, 3)).toBe(1);
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, -1, 3)).toBe(2);
  });

  it("sin resultados no hay activo", () => {
    expect(moveActive(0, 1, 0)).toBe(-1);
  });
});
