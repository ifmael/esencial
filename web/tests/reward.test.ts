// Recompensa al completar: cuándo una sesión está completa y cuántas semanas
// seguidas se ha entrenado (racha semanal de /plan-fuerza).
import { describe, expect, it } from "vitest";
import { isSessionComplete, weekStreak } from "../src/lib/reward";

const set = (done: boolean) => ({ done });

describe("isSessionComplete", () => {
  it("todas las series y el cardio hechos → completa", () => {
    expect(
      isSessionComplete(
        [{ sets: [set(true), set(true)] }, { sets: [set(true)] }],
        [{ done: true }],
      ),
    ).toBe(true);
  });

  it("una sola serie pendiente basta para no estar completa", () => {
    expect(
      isSessionComplete([{ sets: [set(true), set(false)] }], [{ done: true }]),
    ).toBe(false);
  });

  it("el cardio pendiente también cuenta", () => {
    expect(isSessionComplete([{ sets: [set(true)] }], [{ done: false }])).toBe(
      false,
    );
  });

  it("solo cardio, hecho → completa", () => {
    expect(isSessionComplete([], [{ done: true }])).toBe(true);
  });

  it("una sesión sin nada que marcar nunca está completa", () => {
    expect(isSessionComplete([], [])).toBe(false);
    expect(isSessionComplete([{ sets: [] }], [])).toBe(false);
  });
});

const logged = (date: string) => ({ date, status: "logged" as const });
const planned = (date: string) => ({ date, status: "planned" as const });

describe("weekStreak", () => {
  // 2026-09-24 es jueves de la 2026-W39.
  const today = "2026-09-24";

  it("sin sesiones registradas → 0", () => {
    expect(weekStreak([], today)).toBe(0);
    expect(weekStreak([planned("2026-09-22")], today)).toBe(0);
  });

  it("cuenta semanas seguidas con al menos una sesión registrada", () => {
    expect(
      weekStreak(
        [
          logged("2026-09-22"), // W39
          logged("2026-09-21"), // W39 otra vez: la semana cuenta una vez
          logged("2026-09-17"), // W38
          logged("2026-09-07"), // W37
        ],
        today,
      ),
    ).toBe(3);
  });

  it("la semana en curso sin registrar todavía no rompe la racha", () => {
    expect(
      weekStreak([logged("2026-09-17"), logged("2026-09-10")], today),
    ).toBe(2);
  });

  it("un hueco de una semana corta la racha", () => {
    expect(
      weekStreak(
        [logged("2026-09-22"), logged("2026-09-08"), logged("2026-09-01")],
        today,
      ),
    ).toBe(1);
  });

  it("si la última registrada es de hace dos semanas, la racha es 0", () => {
    expect(weekStreak([logged("2026-09-08")], today)).toBe(0);
  });

  it("las sesiones planificadas no cuentan", () => {
    expect(
      weekStreak([logged("2026-09-22"), planned("2026-09-15")], today),
    ).toBe(1);
  });

  it("cruza el cambio de año ISO", () => {
    // 2027-01-05 es martes de la 2027-W01; 2026-12-28 cae en la 2026-W53.
    expect(
      weekStreak([logged("2027-01-04"), logged("2026-12-28")], "2027-01-05"),
    ).toBe(2);
  });
});
