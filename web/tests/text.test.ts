// El plegado de texto (minúsculas y sin tildes) es uno solo. Este test ata a los
// tres consumidores: la búsqueda de ejercicios, la de recetas y la paleta ⌘K.
import { describe, expect, it } from "vitest";
import { filterRecipes } from "../src/components/recipes/filter";
import { scoreMatch } from "../src/lib/command-palette";
import { matchesExercise } from "../src/lib/exercises";
import { fold } from "../src/lib/text";
import { makeRecipe } from "./fixtures";

describe("fold", () => {
  it("pasa a minúsculas y quita las tildes", () => {
    expect(fold("Elevación")).toBe("elevacion");
    expect(fold("NUTRICIÓN")).toBe("nutricion");
    expect(fold("Árbol")).toBe("arbol");
  });

  it("no recorta espacios: cada superficie decide si los limpia", () => {
    expect(fold("  básico ")).toBe("  basico ");
  });
});

describe("mismo plegado en las tres superficies", () => {
  const pairs: [query: string, text: string][] = [
    ["basico", "Poke bowl básico"],
    ["BÁSICO", "Caldo básico de verduras"],
    ["elevacion", "Elevación de gemelos"],
    ["nutricion", "Nutrición"],
    ["arroz", "Arroz con pollo"],
  ];

  it.each(pairs)(
    "«%s» casa «%s» en recetas, ejercicios y ⌘K",
    (query, text) => {
      const recipe = makeRecipe({ name: text, tags: [] });
      expect(filterRecipes([recipe], query)).toHaveLength(1);
      expect(
        matchesExercise({ name: text, aliases: [], tags: [] }, query),
      ).toBe(true);
      expect(scoreMatch(query, text)).not.toBeNull();
    },
  );

  it("lo que no casa no casa en ninguna", () => {
    const recipe = makeRecipe({ name: "Poke bowl básico", tags: [] });
    expect(filterRecipes([recipe], "pizza")).toEqual([]);
    expect(
      matchesExercise(
        { name: "Poke bowl básico", aliases: [], tags: [] },
        "pizza",
      ),
    ).toBe(false);
    expect(scoreMatch("pizza", "Poke bowl básico")).toBeNull();
  });
});
