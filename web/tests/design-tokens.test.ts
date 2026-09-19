import { describe, expect, it } from "vitest";
import {
  findArbitraryValues,
  findSkinClassUsage,
} from "../scripts/check-design-tokens";

describe("guardarraíl de tokens de diseño", () => {
  it("detecta las clases que inventan un valor de la escala", () => {
    expect(
      findArbitraryValues('className="rounded-[7px] text-[10px]"'),
    ).toEqual([
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
    expect(findArbitraryValues(ok)).toEqual([]);
  });

  it("informa de la línea y del valor, no solo de la clase", () => {
    expect(
      findArbitraryValues('const a = 1;\n  className="gap-[3px]"'),
    ).toEqual([{ line: 2, className: "gap-[3px]" }]);
  });

  it("detecta la piel de una primitiva escrita a mano", () => {
    const src = [
      '<div className="card flex gap-2">',
      '  <button className="btn-primary mt-2">Guardar</button>',
      // La plantilla se prueba sin interpolar: el regex acepta cualquier cosa
      // menos una comilla invertida, así que una interpolación también cae.
      "  <span className={`badge-done`}>Hecho</span>",
      "</div>",
    ].join("\n");
    expect(findSkinClassUsage(src)).toEqual([
      { line: 1, className: "card" },
      { line: 2, className: "btn-primary" },
      { line: 3, className: "badge-done" },
    ]);
  });

  it("deja pasar las utilidades compartidas y las clases propias del consumidor", () => {
    const ok = [
      '<Card className="card-interactive flex gap-2">',
      '  <div className="section-label uppercase">RECETA</div>',
      '  <div className="list-row items-center">',
      '  <div className="skeleton h-6" />',
      "</Card>",
    ].join("\n");
    expect(findSkinClassUsage(ok)).toEqual([]);
  });
});
