import { describe, expect, it } from "vitest";
import { addDays, formatDateEs } from "@/app/page";

describe("addDays", () => {
  it("avanza un día", () => {
    const d = addDays(new Date(2026, 8, 1), 1);
    expect(d.getDate()).toBe(2);
  });

  it("retrocede un día", () => {
    const d = addDays(new Date(2026, 8, 1), -1);
    expect(d.getDate()).toBe(31);
    expect(d.getMonth()).toBe(7);
  });
});

describe("formatDateEs", () => {
  it("formatea en es-ES con día de la semana", () => {
    const s = formatDateEs(new Date(2026, 8, 1));
    expect(s).toMatch(/martes, 1 de septiembre/);
  });
});
