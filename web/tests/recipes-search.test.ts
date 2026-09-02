// E2 task 1.3: pure client-side search filter (name substring, CI, + tag).
import { describe, expect, it } from "vitest";
import { filterRecipes } from "../src/components/recipes/filter";
import { makeRecipe } from "./fixtures";

const list = [
  makeRecipe({ id: 1, name: "Arroz con pollo", tags: ["almuerzo", "batch"] }),
  makeRecipe({ id: 2, name: "Ensalada", tags: ["cena"] }),
];

describe("filterRecipes", () => {
  it("empty query returns everything", () => {
    expect(filterRecipes(list, "")).toBe(list);
    expect(filterRecipes(list, "   ")).toBe(list);
  });

  it("matches name substring case-insensitively", () => {
    expect(filterRecipes(list, "ARROZ").map((r) => r.id)).toEqual([1]);
    expect(filterRecipes(list, "ensalada").map((r) => r.id)).toEqual([2]);
  });

  it("matches by tag", () => {
    expect(filterRecipes(list, "batc").map((r) => r.id)).toEqual([1]);
  });

  it("no match returns empty", () => {
    expect(filterRecipes(list, "pizza")).toEqual([]);
  });
});
