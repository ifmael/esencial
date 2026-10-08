// E6 task 2.3: pure helpers for the workout-day screen.
import { describe, expect, it } from "vitest";
import {
  addedSet,
  copiedMarks,
  defaultSetCount,
  formatLast,
  formatPrevious,
  formatSetText,
  isNoWeight,
  isSetFilled,
  isValidDateStr,
  noteOrNull,
  parseDateEs,
  pendingItems,
  pendingLabel,
  previousMarks,
  previousSession,
  setFields,
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

describe("addedSet", () => {
  it("copia las marcas de la última serie", () => {
    expect(
      addedSet([
        { weightKg: 60, reps: 8, durationSecs: null },
        { weightKg: 62.5, reps: 6, durationSecs: null },
      ]),
    ).toEqual({ weightKg: 62.5, reps: 6, durationSecs: null });
  });
  it("copia también los segundos (ejercicios por tiempo)", () => {
    expect(
      addedSet([{ weightKg: null, reps: null, durationSecs: 45 }]),
    ).toEqual({ weightKg: null, reps: null, durationSecs: 45 });
  });
  it("sin series sale vacía", () => {
    expect(addedSet([])).toEqual({
      weightKg: null,
      reps: null,
      durationSecs: null,
    });
  });
});

describe("formatLast", () => {
  it("formatea última sesión", () => {
    expect(formatLast({ weightKg: 57.5, reps: 8, durationSecs: null })).toBe(
      "última: 57.5×8",
    );
  });
  it("null sin helper", () => {
    expect(formatLast(null)).toBeNull();
  });
  it("sin valores displayables no muestra helper", () => {
    expect(
      formatLast({ weightKg: null, reps: null, durationSecs: null }),
    ).toBeNull();
  });
  it("sin peso muestra solo las repeticiones", () => {
    expect(formatLast({ weightKg: null, reps: 10, durationSecs: null })).toBe(
      "última: 10 reps",
    );
  });
  it("por tiempo muestra los segundos", () => {
    expect(formatLast({ weightKg: null, reps: null, durationSecs: 45 })).toBe(
      "última: 45 s",
    );
  });
});

describe("formatSetText", () => {
  it("peso×reps, solo reps sin peso, raya si no hay nada", () => {
    expect(formatSetText({ weightKg: 60, reps: 8, durationSecs: null })).toBe(
      "60×8",
    );
    expect(
      formatSetText({ weightKg: null, reps: 12, durationSecs: null }),
    ).toBe("12 reps");
    expect(
      formatSetText({ weightKg: null, reps: null, durationSecs: null }),
    ).toBe("—");
  });
  it("por tiempo: segundos, con los kilos delante si los hay", () => {
    expect(
      formatSetText({ weightKg: null, reps: null, durationSecs: 45 }),
    ).toBe("45 s");
    expect(formatSetText({ weightKg: 80, reps: null, durationSecs: 40 })).toBe(
      "80 kg × 40 s",
    );
  });
});

describe("isSetFilled", () => {
  it("kg×reps exige kilos y reps", () => {
    const f = setFields("weight_reps");
    expect(isSetFilled({ weightKg: 60, reps: 8, durationSecs: null }, f)).toBe(
      true,
    );
    expect(
      isSetFilled({ weightKg: null, reps: 8, durationSecs: null }, f),
    ).toBe(false);
    expect(
      isSetFilled({ weightKg: 60, reps: null, durationSecs: null }, f),
    ).toBe(false);
  });
  it("sin peso bastan las reps", () => {
    const f = setFields("weight_reps", true);
    expect(
      isSetFilled({ weightKg: null, reps: 8, durationSecs: null }, f),
    ).toBe(true);
    expect(
      isSetFilled({ weightKg: null, reps: null, durationSecs: null }, f),
    ).toBe(false);
  });
  it("peso corporal: bastan las reps, el kg no cuenta", () => {
    const f = setFields("reps");
    expect(
      isSetFilled({ weightKg: null, reps: 15, durationSecs: null }, f),
    ).toBe(true);
    expect(
      isSetFilled({ weightKg: null, reps: null, durationSecs: null }, f),
    ).toBe(false);
  });
  it("por tiempo: bastan los segundos", () => {
    const f = setFields("time");
    expect(
      isSetFilled({ weightKg: null, reps: null, durationSecs: 45 }, f),
    ).toBe(true);
    expect(
      isSetFilled({ weightKg: null, reps: null, durationSecs: null }, f),
    ).toBe(false);
  });
  it("kilos + segundos: exige los dos", () => {
    const f = setFields("weight_time");
    expect(isSetFilled({ weightKg: 80, reps: null, durationSecs: 40 }, f)).toBe(
      true,
    );
    expect(
      isSetFilled({ weightKg: null, reps: null, durationSecs: 40 }, f),
    ).toBe(false);
  });
});

describe("isNoWeight", () => {
  it("todas sin kilos y alguna con reps", () => {
    expect(
      isNoWeight([
        { weightKg: null, reps: 10, durationSecs: null },
        { weightKg: null, reps: null, durationSecs: null },
      ]),
    ).toBe(true);
    expect(isNoWeight([{ weightKg: 5, reps: 10, durationSecs: null }])).toBe(
      false,
    );
    expect(
      isNoWeight([{ weightKg: null, reps: null, durationSecs: null }]),
    ).toBe(false);
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
        { weightKg: 60, reps: 10, durationSecs: null },
        { weightKg: null, reps: null, durationSecs: null },
        { weightKg: 55, reps: 8, durationSecs: null },
      ]),
    ).toBe("sáb, 26/09: 60×10 · 55×8");
  });
  it("sin marcas no muestra nada", () => {
    expect(
      formatPrevious("2026-09-26", [
        { weightKg: null, reps: null, durationSecs: null },
      ]),
    ).toBeNull();
  });
});

describe("previousMarks", () => {
  it("indexa por setIndex: null donde no hay serie homóloga", () => {
    expect(
      previousMarks([
        { setIndex: 0, weightKg: 60, reps: 10, durationSecs: null },
        { setIndex: 2, weightKg: 55, reps: 8, durationSecs: null },
      ]),
    ).toEqual([
      { weightKg: 60, reps: 10, durationSecs: null },
      null,
      { weightKg: 55, reps: 8, durationSecs: null },
    ]);
  });
  it("una serie sin marcas no ofrece valor", () => {
    expect(
      previousMarks([
        { setIndex: 0, weightKg: 60, reps: null, durationSecs: null },
      ]),
    ).toEqual([null]);
  });
  it("una serie por tiempo ofrece sus segundos", () => {
    expect(
      previousMarks([
        { setIndex: 0, weightKg: null, reps: null, durationSecs: 45 },
      ]),
    ).toEqual([{ weightKg: null, reps: null, durationSecs: 45 }]);
  });
  it("sin series previas no hay nada que copiar", () => {
    expect(previousMarks([])).toEqual([]);
  });
});

describe("copiedMarks", () => {
  const target = {
    weightKg: 40,
    reps: 6,
    durationSecs: null,
    done: true,
    touched: true,
  };
  it("copia reps y kilos y deja la serie desmarcada y sin editar", () => {
    expect(
      copiedMarks(
        target,
        { weightKg: 60, reps: 10, durationSecs: null },
        false,
      ),
    ).toEqual({
      weightKg: 60,
      reps: 10,
      durationSecs: null,
      done: false,
      touched: false,
    });
  });
  it("origen sin kilos: solo las reps, sin tocar los kilos puestos", () => {
    expect(
      copiedMarks(
        target,
        { weightKg: null, reps: 12, durationSecs: null },
        false,
      ),
    ).toEqual({
      weightKg: 40,
      reps: 12,
      durationSecs: null,
      done: false,
      touched: false,
    });
  });
  it("con «sin peso» no escribe kilos", () => {
    expect(
      copiedMarks(target, { weightKg: 60, reps: 12, durationSecs: null }, true),
    ).toEqual({
      weightKg: 40,
      reps: 12,
      durationSecs: null,
      done: false,
      touched: false,
    });
  });
  it("copia los segundos de un ejercicio por tiempo", () => {
    expect(
      copiedMarks(
        { ...target, reps: null, weightKg: null },
        { weightKg: null, reps: null, durationSecs: 45 },
        false,
      ),
    ).toEqual({
      weightKg: null,
      reps: null,
      durationSecs: 45,
      done: false,
      touched: false,
    });
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

describe("pendingItems", () => {
  it("lista las series sin marcar (1-based) y salta los ejercicios completos", () => {
    expect(
      pendingItems([
        {
          id: 1,
          name: "Press banca",
          sets: [{ done: true }, { done: false }, { done: false }],
          done: null,
        },
        {
          id: 2,
          name: "Remo",
          sets: [{ done: true }, { done: true }],
          done: null,
        },
      ]),
    ).toEqual([{ id: 1, name: "Press banca", sets: [2, 3] }]);
  });
  it("el cardio sin marcar va sin series; el hecho no aparece", () => {
    expect(
      pendingItems([
        { id: 3, name: "Cinta", sets: null, done: false },
        { id: 4, name: "Bici", sets: null, done: true },
      ]),
    ).toEqual([{ id: 3, name: "Cinta", sets: [] }]);
  });
  it("sin nada pendiente devuelve la lista vacía", () => {
    expect(
      pendingItems([
        { id: 5, name: "Press banca", sets: [{ done: true }], done: null },
      ]),
    ).toEqual([]);
  });
});

describe("pendingLabel", () => {
  it("nombra las series que faltan", () => {
    expect(pendingLabel([1, 3])).toBe("Series 1, 3");
  });
  it("sin series es el cardio sin hacer", () => {
    expect(pendingLabel([])).toBe("Sin hacer");
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
