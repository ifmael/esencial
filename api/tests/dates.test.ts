// E5 task 1.1/1.2: pure ISO calendar helpers on YYYY-MM-DD strings (no clock).
import { describe, expect, it } from "vitest";
import { dayIndexOf, isoWeekOf } from "../src/dates";

describe("isoWeekOf", () => {
  it("2026-09-01 (martes) → 2026-W36", () => {
    expect(isoWeekOf("2026-09-01")).toBe("2026-W36");
  });

  it("2026-09-06 (domingo) pertenece a la semana del lunes 2026-08-31 → 2026-W36", () => {
    expect(isoWeekOf("2026-09-06")).toBe("2026-W36");
  });

  it("2026-12-31 (jueves) → 2026-W53", () => {
    expect(isoWeekOf("2026-12-31")).toBe("2026-W53");
  });

  it("2027-01-01 (viernes, jueves sigue en 2026) → 2026-W53", () => {
    expect(isoWeekOf("2027-01-01")).toBe("2026-W53");
  });

  it("borde de año: lunes 2027-01-04 abre 2027-W01", () => {
    expect(isoWeekOf("2027-01-03")).toBe("2026-W53"); // domingo: sigue en W53
    expect(isoWeekOf("2027-01-04")).toBe("2027-W01"); // lunes: semana 1 de 2027
  });
});

describe("dayIndexOf", () => {
  it("lunes = 0 … domingo = 6", () => {
    expect(dayIndexOf("2026-08-31")).toBe(0); // lunes
    expect(dayIndexOf("2026-09-01")).toBe(1); // martes
    expect(dayIndexOf("2026-09-02")).toBe(2); // miércoles
    expect(dayIndexOf("2026-09-06")).toBe(6); // domingo
    expect(dayIndexOf("2027-01-01")).toBe(4); // viernes
  });
});

describe("entrada inválida", () => {
  for (const bad of ["2026-9-2", "not-a-date", "", "2026-13-45", "2026-02-30", "20x6-09-01"]) {
    it(`rechaza ${JSON.stringify(bad)}`, () => {
      expect(isoWeekOf(bad)).toBeNull();
      expect(dayIndexOf(bad)).toBeNull();
    });
  }
});
