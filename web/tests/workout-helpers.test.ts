// E6 task 2.3: pure helpers for the workout-day screen.
import { describe, expect, it } from "vitest";
import {
  defaultSetCount,
  formatLast,
  formatPrevious,
  formatSetText,
  isNoWeight,
  isSetFilled,
  isValidDateStr,
  noteOrNull,
  parseDateEs,
  previousSession,
  setsProgress,
  weekProgress,
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
  it("sin peso muestra solo las repeticiones", () => {
    expect(formatLast({ weightKg: null, reps: 10 })).toBe("última: 10 reps");
  });
});

describe("formatSetText", () => {
  it("peso×reps, solo reps sin peso, raya si no hay nada", () => {
    expect(formatSetText({ weightKg: 60, reps: 8 })).toBe("60×8");
    expect(formatSetText({ weightKg: null, reps: 12 })).toBe("12 reps");
    expect(formatSetText({ weightKg: null, reps: null })).toBe("—");
  });
});

describe("isSetFilled", () => {
  it("con peso exige kilos y reps", () => {
    expect(isSetFilled({ weightKg: 60, reps: 8 }, false)).toBe(true);
    expect(isSetFilled({ weightKg: null, reps: 8 }, false)).toBe(false);
    expect(isSetFilled({ weightKg: 60, reps: null }, false)).toBe(false);
  });
  it("sin peso bastan las reps", () => {
    expect(isSetFilled({ weightKg: null, reps: 8 }, true)).toBe(true);
    expect(isSetFilled({ weightKg: null, reps: null }, true)).toBe(false);
  });
});

describe("isNoWeight", () => {
  it("todas sin kilos y alguna con reps", () => {
    expect(
      isNoWeight([
        { weightKg: null, reps: 10 },
        { weightKg: null, reps: null },
      ]),
    ).toBe(true);
    expect(isNoWeight([{ weightKg: 5, reps: 10 }])).toBe(false);
    expect(isNoWeight([{ weightKg: null, reps: null }])).toBe(false);
    expect(isNoWeight([])).toBe(false);
  });
});

describe("previousSession", () => {
  const s = (date: string, name: string | null, status = "logged") => ({
    date,
    name,
    status,
  });
  it("la registrada más reciente con el mismo nombre antes de la fecha", () => {
    const list = [
      s("2026-09-19", "Empuje A"),
      s("2026-09-26", "Empuje A"),
      s("2026-09-24", "Tirón"),
      s("2026-09-27", "Empuje A", "planned"),
      s("2026-10-02", "Empuje A"), // posterior: no cuenta
    ];
    expect(previousSession(list, "2026-09-29", "Empuje A")?.date).toBe(
      "2026-09-26",
    );
  });
  it("sin nombre nunca empareja", () => {
    expect(
      previousSession([s("2026-09-26", null)], "2026-09-29", null),
    ).toBeNull();
  });
});

describe("formatPrevious", () => {
  it("fecha corta y series con marcas", () => {
    expect(
      formatPrevious("2026-09-26", [
        { weightKg: 60, reps: 10 },
        { weightKg: null, reps: null },
        { weightKg: 55, reps: 8 },
      ]),
    ).toBe("sáb, 26/09: 60×10 · 55×8");
  });
  it("sin marcas no muestra nada", () => {
    expect(
      formatPrevious("2026-09-26", [{ weightKg: null, reps: null }]),
    ).toBeNull();
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
    expect(parseDateEs("2026-09-02").getTime()).toBe(
      new Date(2026, 8, 2).getTime(),
    );
  });
});

describe("setsProgress", () => {
  it("cuenta series hechas sobre el total, incluido el cardio como una serie", () => {
    expect(
      setsProgress(
        [{ done: true }, { done: false }, { done: true }],
        [{ done: true }, { done: false }],
      ),
    ).toEqual({ done: 3, total: 5 });
  });
  it("sin nada planificado es 0 de 0", () => {
    expect(setsProgress([], [])).toEqual({ done: 0, total: 0 });
  });
});

describe("weekProgress", () => {
  it("cuenta sesiones registradas sobre las planificadas de la semana", () => {
    expect(
      weekProgress([
        { status: "logged" },
        { status: "planned" },
        { status: "logged" },
      ]),
    ).toEqual({ logged: 2, total: 3 });
  });
});
