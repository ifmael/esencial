// Búsqueda de ejercicios: se casa el nombre canónico, los alias (el nombre
// inglés y los sinónimos) y los grupos musculares, plegando mayúsculas y
// tildes. Lo comparten las cuatro superficies (catálogo, plantilla, día y ⌘K).
import { describe, expect, it } from "vitest";
import {
  type Exercise,
  exerciseSearchTerms,
  matchesExercise,
} from "../src/lib/exercises";

const make = (over: Partial<Exercise> = {}): Exercise => ({
  id: 1,
  name: "Paseo del granjero",
  description: null,
  setupCues: null,
  techniqueUrl: null,
  steps: null,
  tags: ["antebrazo", "core"],
  regions: [{ region: "forearm", role: "primary" }],
  aliases: ["farmer carry", "farmer's walk", "paseo de granjero"],
  kind: "strength",
  ...over,
});

describe("matchesExercise", () => {
  it("casa por el nombre canónico, sin mirar mayúsculas ni tildes", () => {
    const e = make({ name: "Elevación de gemelos de pie", aliases: [] });
    expect(matchesExercise(e, "elevacion")).toBe(true);
    expect(matchesExercise(e, "ELEVACIÓN")).toBe(true);
    expect(matchesExercise(e, "gemelos")).toBe(true);
  });

  it("casa por alias: el nombre inglés encuentra el ejercicio español", () => {
    const e = make();
    expect(matchesExercise(e, "farmer carry")).toBe(true);
    expect(matchesExercise(e, "FARMER'S WALK")).toBe(true);
    expect(matchesExercise(e, "paseo de granjero")).toBe(true);
  });

  it("casa por grupo muscular", () => {
    expect(matchesExercise(make(), "antebrazo")).toBe(true);
    expect(matchesExercise(make(), "hombro")).toBe(false);
  });

  it("sin coincidencia es false y la consulta vacía es todo", () => {
    const e = make();
    expect(matchesExercise(e, "sentadilla")).toBe(false);
    expect(matchesExercise(e, "   ")).toBe(true);
    expect(matchesExercise(e, "")).toBe(true);
  });

  it("términos extra (p. ej. la etiqueta de la sub-región) se suman a los suyos", () => {
    const e = make({ aliases: [] });
    expect(matchesExercise(e, "antebrazo", ["Antebrazo"])).toBe(true);
    expect(matchesExercise(e, "cuadriceps", ["Cuádriceps"])).toBe(true);
    expect(matchesExercise(e, "cuadriceps", ["Isquios"])).toBe(false);
  });
});

describe("exerciseSearchTerms", () => {
  it("reúne nombre, alias y grupos (lo que indexa ⌘K)", () => {
    expect(exerciseSearchTerms(make())).toEqual([
      "Paseo del granjero",
      "farmer carry",
      "farmer's walk",
      "paseo de granjero",
      "antebrazo",
      "core",
    ]);
  });
});
