// Ambiente de la dirección «cristal»: tema claro/oscuro, aurora que se pausa con
// la pestaña oculta e inclinación 3D de las tarjetas que siguen al puntero.
import { afterEach, describe, expect, it } from "vitest";
import {
  effectiveTheme,
  installAmbient,
  saveTheme,
  THEME_KEY,
  tiltFor,
} from "../src/lib/ambient";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.hidden;
});

describe("tema", () => {
  it("la elección guardada manda sobre la del sistema", () => {
    expect(effectiveTheme("light", true)).toBe("light");
    expect(effectiveTheme("dark", false)).toBe("dark");
  });

  it("sin elección (o con basura guardada) sigue al sistema", () => {
    expect(effectiveTheme(null, true)).toBe("dark");
    expect(effectiveTheme("sepia", false)).toBe("light");
  });

  it("guardar un tema lo aplica al documento y lo recuerda", () => {
    saveTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
  });

  it("al arrancar aplica el tema guardado", () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    const stop = installAmbient();
    expect(document.documentElement.dataset.theme).toBe("dark");
    stop();
  });
});

describe("aurora y visibilidad", () => {
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("marca el documento mientras la pestaña está oculta y lo desmarca al volver", () => {
    const stop = installAmbient();
    setHidden(true);
    expect(document.documentElement.dataset.hidden).toBe("");
    setHidden(false);
    expect(document.documentElement.dataset.hidden).toBeUndefined();
    stop();
  });

  it("deja de escuchar al desinstalarse", () => {
    const stop = installAmbient();
    stop();
    setHidden(true);
    expect(document.documentElement.dataset.hidden).toBeUndefined();
    setHidden(false);
  });
});

describe("inclinación de tarjeta", () => {
  const rect = { left: 100, top: 200, width: 200, height: 100 };

  it("en el centro no inclina", () => {
    expect(tiltFor(rect, 200, 250, 6)).toEqual({ x: 0, y: 0 });
  });

  it("en las esquinas inclina el máximo, hacia el puntero", () => {
    // Arriba a la izquierda: el borde superior se aleja (rotateX +) y el
    // izquierdo también (rotateY −).
    expect(tiltFor(rect, 100, 200, 6)).toEqual({ x: 6, y: -6 });
    expect(tiltFor(rect, 300, 300, 6)).toEqual({ x: -6, y: 6 });
  });

  it("fuera de la tarjeta se queda en el máximo, sin pasarse", () => {
    expect(tiltFor(rect, 900, -50, 6)).toEqual({ x: 6, y: 6 });
  });
});

describe("theme.js (antes del primer pintado)", () => {
  // Es un script clásico en public/: no puede importar ambient.ts, así que se
  // ejecuta tal cual y se exige que decida lo mismo con la misma clave.
  const run = async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("public/theme.js", "utf8"); // vitest corre en web/
    new Function(src)();
  };

  it("aplica el tema guardado con la misma clave que ambient.ts", async () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    await run();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("sin elección válida cae en el del sistema, como effectiveTheme", async () => {
    window.localStorage.setItem(THEME_KEY, "sepia");
    window.matchMedia = ((q: string) => ({
      matches: q.includes("dark"),
    })) as typeof window.matchMedia;
    await run();
    expect(document.documentElement.dataset.theme).toBe(
      effectiveTheme("sepia", true),
    );
  });
});
