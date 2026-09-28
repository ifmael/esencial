// Color dinámico por receta (/recetario/:id con foto): semilla de la foto →
// esquema tonal de la receta → variables CSS sobre el contenedor de la
// pantalla. `color-scheme` (y material-color-utilities) se importa perezoso:
// solo lo descarga quien abre una receta con foto. Cualquier fallo (sin foto,
// error de carga, canvas contaminado, esquema que no pasa AA) → undefined y
// manda el esquema de sección.
import { type CSSProperties, useEffect, useState } from "react";
import type { Scheme } from "./color-scheme";

/** Variables del contenedor que se sobreescriben con el esquema de la receta. */
export function schemeVars(s: Scheme): Record<string, string> {
  return {
    "--accent": s.primary,
    "--on-accent": s["on-primary"],
    "--accent-container": s["primary-container"],
    "--on-accent-container": s["on-primary-container"],
    "--color-primary": s.primary,
    "--color-on-primary": s["on-primary"],
    "--color-primary-container": s["primary-container"],
    "--color-on-primary-container": s["on-primary-container"],
    "--color-secondary-container": s["secondary-container"],
    "--color-on-secondary-container": s["on-secondary-container"],
    "--color-surface-container-low": s["surface-container-low"],
    "--color-surface-container": s["surface-container"],
    "--color-surface-container-high": s["surface-container-high"],
  };
}

const SIZE = 64;

function loadImage(src: string): Promise<HTMLImageElement> {
  const { promise, resolve, reject } =
    Promise.withResolvers<HTMLImageElement>();
  const img = new Image();
  // La foto viene de la API (otro origen, con cookie): sin CORS el canvas
  // queda contaminado y getImageData lanza. OJO: todos los <img> de fotos de
  // la app piden también con crossOrigin="use-credentials"; si alguno la
  // pidiera sin CORS, el navegador serviría esa copia de caché (sin cabeceras
  // CORS) a esta petición y fallaría.
  img.crossOrigin = "use-credentials";
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
  return promise;
}

async function schemesFor(src: string) {
  const [{ seedFromPixels, recipeScheme }, img] = await Promise.all([
    import("./color-scheme"),
    loadImage(src),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const seed = seedFromPixels(ctx.getImageData(0, 0, SIZE, SIZE).data);
  return seed === null ? null : recipeScheme(seed);
}

const isDark = () => document.documentElement.dataset.theme === "dark";

/** `style` para el contenedor de la pantalla, o undefined (esquema de sección). */
export function useRecipeColor(
  photoUrl: string | null,
): CSSProperties | undefined {
  const [schemes, setSchemes] = useState<{
    light: Scheme;
    dark: Scheme;
  } | null>(null);
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    setSchemes(null);
    if (!photoUrl) return;
    let alive = true;
    schemesFor(photoUrl)
      .then((s) => alive && setSchemes(s))
      .catch(() => alive && setSchemes(null));
    return () => {
      alive = false;
    };
  }, [photoUrl]);

  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDark()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  if (!photoUrl || !schemes) return undefined;
  return schemeVars(dark ? schemes.dark : schemes.light) as CSSProperties;
}
