// Tema sistema/claro/oscuro, aplicado antes del primer pintado por
// `public/theme.js` y después por `lib/theme.ts`: los dos deciden lo mismo.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  nextTheme,
  readTheme,
  resolveTheme,
  THEME_KEY,
} from "../src/lib/theme";

const root = document.documentElement;

afterEach(() => {
  window.localStorage.clear();
  delete root.dataset.theme;
});

const withSystem = (dark: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: dark && q.includes("dark"),
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
};

describe("tema", () => {
  it("el ciclo es sistema → claro → oscuro → sistema", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });

  it("sin elección guardada (o con basura) sigue al sistema", () => {
    expect(readTheme()).toBe("system");
    window.localStorage.setItem(THEME_KEY, "morado");
    expect(readTheme()).toBe("system");
  });

  it("resolveTheme: la elección manda; «sistema» pregunta al sistema", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("aplicar fija data-theme con el tema efectivo y recuerda la elección", () => {
    withSystem(true);
    applyTheme("light");
    expect(root.dataset.theme).toBe("light");
    expect(readTheme()).toBe("light");
    applyTheme("system");
    expect(root.dataset.theme).toBe("dark");
    expect(readTheme()).toBe("system");
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });
});

describe("theme.js (antes del primer pintado)", () => {
  // Script clásico en public/: no puede importar theme.ts, así que se ejecuta
  // tal cual y se exige que decida lo mismo con la misma clave.
  const run = () => new Function(readFileSync("public/theme.js", "utf8"))();

  it("aplica el tema guardado con la misma clave", () => {
    withSystem(false);
    window.localStorage.setItem(THEME_KEY, "dark");
    run();
    expect(root.dataset.theme).toBe("dark");
  });

  for (const dark of [false, true]) {
    it(`sin elección válida sigue al sistema (${dark ? "oscuro" : "claro"}), como resolveTheme`, () => {
      withSystem(dark);
      window.localStorage.setItem(THEME_KEY, "sepia");
      run();
      expect(root.dataset.theme).toBe(resolveTheme(readTheme(), dark));
    });
  }
});
