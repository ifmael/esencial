import { describe, expect, it } from "vitest";
import { findViolations } from "../scripts/check-design-tokens";

describe("guardarraíl de tokens de diseño", () => {
  it("detecta las clases que inventan un valor de la escala", () => {
    expect(findViolations('className="rounded-[7px] text-[10px]"')).toEqual([
      { line: 1, className: "rounded-[7px]" },
      { line: 1, className: "text-[10px]" },
    ]);
  });

  it("acepta tokens y valores derivados de tokens o del entorno", () => {
    const ok = [
      'className="rounded-card text-caption p-card gap-section"',
      'className="rounded-[calc(var(--radius-control)-2px)]"',
      'className="pb-[env(safe-area-inset-bottom)]"',
      'className="max-h-[85vh] min-h-11 w-16 md:grid-cols-[1fr_auto]"',
      'className="shadow-raised duration-base ease-out-quart"',
    ].join("\n");
    expect(findViolations(ok)).toEqual([]);
  });

  it("informa de la línea y del valor, no solo de la clase", () => {
    expect(findViolations('const a = 1;\n  className="gap-[3px]"')).toEqual([
      { line: 2, className: "gap-[3px]" },
    ]);
  });
});
