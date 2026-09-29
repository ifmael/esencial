// Color dinámico por receta: del esquema tonal de la foto a las variables CSS
// que se sobreescriben en el contenedor de /recetario/:id.
import { describe, expect, it } from "vitest";
import { brandScheme } from "../src/lib/color-scheme";
import { schemeVars } from "../src/lib/recipe-color";

describe("schemeVars", () => {
  const scheme = brandScheme(false);
  const vars = schemeVars(scheme);

  it("el acento de la pantalla pasa a ser el primary de la receta", () => {
    expect(vars["--accent"]).toBe(scheme.primary);
    expect(vars["--on-accent"]).toBe(scheme["on-primary"]);
    expect(vars["--accent-container"]).toBe(scheme["primary-container"]);
    expect(vars["--on-accent-container"]).toBe(scheme["on-primary-container"]);
  });

  it("tiñe primary, secondary-container y las superficies de contenedor", () => {
    expect(vars).toEqual({
      "--accent": scheme.primary,
      "--on-accent": scheme["on-primary"],
      "--accent-container": scheme["primary-container"],
      "--on-accent-container": scheme["on-primary-container"],
      "--accent-soft": scheme["secondary-container"],
      "--on-accent-soft": scheme["on-secondary-container"],
      "--color-primary": scheme.primary,
      "--color-on-primary": scheme["on-primary"],
      "--color-primary-container": scheme["primary-container"],
      "--color-on-primary-container": scheme["on-primary-container"],
      "--color-secondary-container": scheme["secondary-container"],
      "--color-on-secondary-container": scheme["on-secondary-container"],
      "--color-surface-container-low": scheme["surface-container-low"],
      "--color-surface-container": scheme["surface-container"],
      "--color-surface-container-high": scheme["surface-container-high"],
    });
  });
});
