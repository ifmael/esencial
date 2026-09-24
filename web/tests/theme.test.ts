import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, nextTheme, readTheme } from "../src/lib/theme";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("tema", () => {
  it("el ciclo es sistema → claro → oscuro → sistema", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });

  it("sin elección guardada (o con basura) sigue al sistema", () => {
    expect(readTheme()).toBe("system");
    window.localStorage.setItem("esencial.theme", "morado");
    expect(readTheme()).toBe("system");
  });

  it("aplicar fija data-theme y lo recuerda; sistema lo quita", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(readTheme()).toBe("dark");
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(readTheme()).toBe("system");
  });
});
