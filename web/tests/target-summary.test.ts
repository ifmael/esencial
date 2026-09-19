// targetSummary: formato único de la info del ejercicio (celda del día y
// plantillas). Ramas reales: singular/plural de series y cardio parcial.
import { describe, expect, it } from "vitest";
import { targetSummary } from "../src/lib/exercises";

const strength = (sets: number | null) => ({
  kind: "strength" as const,
  targetSets: sets,
  targetDistanceKm: null,
  targetDurationMin: null,
});

const cardio = (km: number | null, min: number | null) => ({
  kind: "running" as const,
  targetSets: null,
  targetDistanceKm: km,
  targetDurationMin: min,
});

describe("targetSummary", () => {
  it("fuerza: plural, singular y sin series (null)", () => {
    expect(targetSummary(strength(3))).toBe("3 series");
    expect(targetSummary(strength(1))).toBe("1 serie");
    expect(targetSummary(strength(null))).toBeNull();
  });

  it("cardio: ambos, solo uno, y el tipo cuando no hay datos", () => {
    expect(targetSummary(cardio(10, 45))).toBe("10 km · 45 min");
    expect(targetSummary(cardio(10, null))).toBe("10 km");
    expect(targetSummary(cardio(null, 30))).toBe("30 min");
    expect(targetSummary(cardio(null, null))).toBe("Running");
  });
});
