// La métrica de la serie vive en dos sitios que tienen que decir lo mismo: lo
// que valida la API (`METRICS`) y lo que enseña el editor de ejercicios
// (`METRIC_LABELS`). Este test cruza las dos tablas: si una cambia de nombre y
// la otra no, falla. `setFields` es el mapeo métrica → campos que pide la serie.
import { describe, expect, it } from "vitest";
import { METRICS } from "../../api/src/api-validation";
import { METRIC_LABELS, METRIC_ORDER } from "../src/lib/exercises";
import { setFields } from "../src/lib/workout";

describe("METRIC_LABELS", () => {
  it("es exactamente el vocabulario que valida la API", () => {
    expect(Object.keys(METRIC_LABELS).sort()).toEqual([...METRICS].sort());
  });

  it("el orden del editor cubre todas las métricas, sin repetir", () => {
    expect([...METRIC_ORDER].sort()).toEqual([...METRICS].sort());
    expect(new Set(METRIC_ORDER).size).toBe(METRIC_ORDER.length);
  });
});

describe("setFields", () => {
  it("cada métrica pide los campos de su unidad", () => {
    expect(setFields("weight_reps")).toEqual({
      weight: true,
      reps: true,
      time: false,
    });
    expect(setFields("reps")).toEqual({
      weight: false,
      reps: true,
      time: false,
    });
    expect(setFields("time")).toEqual({
      weight: false,
      reps: false,
      time: true,
    });
    expect(setFields("weight_time")).toEqual({
      weight: true,
      reps: false,
      time: true,
    });
  });

  it("«sin peso» solo suelta los kilos de weight_reps", () => {
    expect(setFields("weight_reps", true).weight).toBe(false);
    expect(setFields("reps", true)).toEqual(setFields("reps"));
    expect(setFields("time", true)).toEqual(setFields("time"));
    expect(setFields("weight_time", true).weight).toBe(true);
  });
});
