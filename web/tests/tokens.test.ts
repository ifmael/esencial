// Los tokens congelados en `src/tokens.css` son los que saldrían hoy del
// generador: si cambia la semilla o un muelle, hay que regenerarlos.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tokensCss } from "../scripts/gen-tokens";

describe("tokens.css", () => {
  it("coincide con lo que genera scripts/gen-tokens.ts", () => {
    expect(readFileSync("src/tokens.css", "utf8")).toBe(tokensCss());
  });
});
