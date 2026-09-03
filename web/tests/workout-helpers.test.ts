// E6 task 2.3: pure helpers for the workout-day screen.
import { describe, expect, it } from "vitest";
import {
  defaultSetCount,
  formatLast,
  isValidDateStr,
  noteOrNull,
  parseDateEs,
} from "../src/lib/workout";

describe("defaultSetCount", () => {
  it("usa targetSets cuando existe", () => {
    expect(defaultSetCount(4)).toBe(4);
  });
  it("por defecto 3 si falta", () => {
    expect(defaultSetCount(null)).toBe(3);
    expect(defaultSetCount(undefined)).toBe(3);
  });
});

describe("formatLast", () => {
  it("formatea última sesión", () => {
    expect(formatLast({ weightKg: 57.5, reps: 8 })).toBe("última: 57.5×8");
  });
  it("null sin helper", () => {
    expect(formatLast(null)).toBeNull();
  });
  it("sin valores displayables no muestra helper", () => {
    expect(formatLast({ weightKg: null, reps: null })).toBeNull();
    expect(formatLast({ weightKg: 60, reps: null })).toBeNull();
  });
});

describe("noteOrNull", () => {
  it("recorta y pasa a null si queda vacío", () => {
    expect(noteOrNull("  fuerte  ")).toBe("fuerte");
    expect(noteOrNull("   ")).toBeNull();
    expect(noteOrNull("")).toBeNull();
  });
});

describe("isValidDateStr / parseDateEs", () => {
  it("rechaza formatos inválidos", () => {
    expect(isValidDateStr("hola")).toBe(false);
    expect(isValidDateStr("2026-09-2")).toBe(false);
    expect(isValidDateStr("2026-13-40")).toBe(false);
  });
  it("acepta fecha real y la parsea local", () => {
    expect(isValidDateStr("2026-09-02")).toBe(true);
    expect(parseDateEs("2026-09-02").getTime()).toBe(new Date(2026, 8, 2).getTime());
  });
});
