// Color M3: esquema tonal desde una semilla, contraste AA y la caída del color
// dinámico por receta cuando el resultado no llega.
import { argbFromHex } from "@material/material-color-utilities";
import { describe, expect, it } from "vitest";
import {
  AA_PAIRS,
  BRAND_SEED,
  brandScheme,
  contrastRatio,
  failingPairs,
  recipeScheme,
  ROLES,
  seedFromPixels,
} from "../src/lib/color-scheme";

describe("contrastRatio", () => {
  it("negro sobre blanco es 21 y un color consigo mismo es 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#15803d", "#15803d")).toBeCloseTo(1, 5);
  });

  it("es simétrico", () => {
    expect(contrastRatio("#15803d", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#15803d"),
      5,
    );
  });
});

describe("esquema de marca", () => {
  for (const dark of [false, true]) {
    const scheme = brandScheme(dark);
    const theme = dark ? "oscuro" : "claro";

    it(`trae todos los roles M3 en ${theme}`, () => {
      for (const role of ROLES) expect(scheme[role], role).toMatch(/^#[0-9a-f]{6}$/);
    });

    it(`cumple AA en todas las parejas texto/fondo en ${theme}`, () => {
      expect(failingPairs(scheme)).toEqual([]);
    });
  }

  it("nutrición (tertiary) es cálida y distinta del verde de deporte", () => {
    const tertiary = brandScheme(false).tertiary;
    const r = Number.parseInt(tertiary.slice(1, 3), 16);
    const g = Number.parseInt(tertiary.slice(3, 5), 16);
    expect(r).toBeGreaterThan(g);
  });

  it("la semilla es el verde de marca", () => {
    expect(BRAND_SEED).toBe("#15803d");
  });
});

describe("failingPairs", () => {
  it("señala la pareja que no llega a 4,5:1", () => {
    const bad = { ...brandScheme(false) };
    bad["on-primary"] = bad.primary;
    expect(failingPairs(bad)).toContainEqual(["on-primary", "primary"]);
  });

  it("cubre al menos las parejas de primary, secondary, tertiary, error y superficie", () => {
    const fg = AA_PAIRS.map(([f]) => f);
    for (const role of [
      "on-primary",
      "on-primary-container",
      "on-secondary-container",
      "on-tertiary-container",
      "on-error",
      "on-surface",
      "on-surface-variant",
      "inverse-on-surface",
    ])
      expect(fg).toContain(role);
  });
});

describe("recipeScheme (color dinámico)", () => {
  it("de una semilla naranja sale un esquema naranja con AA en claro y oscuro", () => {
    const scheme = recipeScheme(argbFromHex("#e0701a"));
    expect(scheme).not.toBeNull();
    if (!scheme) return;
    expect(failingPairs(scheme.light)).toEqual([]);
    expect(failingPairs(scheme.dark)).toEqual([]);
    const p = scheme.light.primary;
    expect(Number.parseInt(p.slice(1, 3), 16)).toBeGreaterThan(
      Number.parseInt(p.slice(5, 7), 16),
    );
  });

  it("devuelve null (manda el esquema de sección) si el resultado no llega a AA", () => {
    const always = () => [["on-primary", "primary"] as const];
    expect(recipeScheme(argbFromHex("#e0701a"), always)).toBeNull();
  });
});

describe("seedFromPixels", () => {
  it("una foto casi toda de un color da una semilla de ese tono", () => {
    const px = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < px.length; i += 4) {
      px[i] = 220;
      px[i + 1] = 60;
      px[i + 2] = 40;
      px[i + 3] = 255;
    }
    const seed = seedFromPixels(px);
    const r = (seed >> 16) & 255;
    const b = seed & 255;
    expect(r).toBeGreaterThan(b);
  });

  it("una foto transparente no rompe: cae en la semilla de marca", () => {
    const seed = seedFromPixels(new Uint8ClampedArray(16 * 4));
    expect(seed).toBe(argbFromHex(BRAND_SEED));
  });
});
