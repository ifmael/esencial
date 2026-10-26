// iso-week: asistente puro de semanas ISO-8601 (lunes→domingo).
import { describe, expect, it } from "vitest";
import {
  currentIsoWeek,
  isoWeekDates,
  isoWeekOf,
  isoWeekOfDay,
  shiftIsoWeek,
} from "../src/lib/iso-week";

describe("isoWeekOf", () => {
  it("lunes 2026-08-31 es la semana 36 de 2026", () => {
    expect(isoWeekOf(new Date(Date.UTC(2026, 7, 31)))).toBe("2026-W36");
  });

  it("domingo 2027-01-03 pertenece a 2026-W53 (año ISO de 53 semanas)", () => {
    expect(isoWeekOf(new Date(Date.UTC(2027, 0, 3)))).toBe("2026-W53");
  });

  it("currentIsoWeek devuelve formato YYYY-Www", () => {
    expect(currentIsoWeek()).toMatch(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/);
  });
});

describe("shiftIsoWeek", () => {
  it("avanza dentro del año", () => {
    expect(shiftIsoWeek("2026-W36", 1)).toBe("2026-W37");
    expect(shiftIsoWeek("2026-W37", -1)).toBe("2026-W36");
  });

  it("cruza diciembre→enero: 2025-W52 → 2026-W01", () => {
    expect(shiftIsoWeek("2025-W52", 1)).toBe("2026-W01");
    expect(shiftIsoWeek("2026-W01", -1)).toBe("2025-W52");
  });

  it("2026 tiene 53 semanas: W52→W53→2027-W01 y viceversa", () => {
    expect(shiftIsoWeek("2026-W52", 1)).toBe("2026-W53");
    expect(shiftIsoWeek("2026-W53", 1)).toBe("2027-W01");
    expect(shiftIsoWeek("2027-W01", -1)).toBe("2026-W53");
  });
});

describe("isoWeekDates", () => {
  it("las siete fechas de la semana, de lunes a domingo", () => {
    expect(isoWeekDates("2026-W36")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  it("cruza el cambio de año: 2026-W53 empieza el 28 de diciembre", () => {
    expect(isoWeekDates("2026-W53")[0]).toBe("2026-12-28");
    expect(isoWeekDates("2027-W01")[0]).toBe("2027-01-04");
  });
});

describe("isoWeekOfDay", () => {
  it("la semana ISO de una fecha YYYY-MM-DD (sin reloj)", () => {
    expect(isoWeekOfDay("2026-08-31")).toBe("2026-W36");
    expect(isoWeekOfDay("2026-09-06")).toBe("2026-W36");
    expect(isoWeekOfDay("2026-09-07")).toBe("2026-W37");
    expect(isoWeekOfDay("2027-01-03")).toBe("2026-W53");
  });
});
