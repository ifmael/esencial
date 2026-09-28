// Color M3 desde una semilla. Dos usos:
// 1. Una vez, en build: `scripts/gen-tokens.ts` congela el esquema de marca en
//    `globals.css` (nada de esto viaja en el bundle por ese camino).
// 2. En `/recetario/:id` con foto: se carga perezoso (import dinámico) para
//    teñir la pantalla con el color de la foto, y si el resultado no pasa AA se
//    descarta y manda el esquema de sección.
import {
  argbFromHex,
  argbFromRgb,
  DynamicScheme,
  Hct,
  hexFromArgb,
  MaterialDynamicColors as M,
  QuantizerCelebi,
  Score,
  SchemeFidelity,
  TonalPalette,
} from "@material/material-color-utilities";

export const BRAND_SEED = "#15803d";

/** Roles M3 que la app congela como tokens (`--color-<rol>`). */
export const ROLES = [
  "primary",
  "on-primary",
  "primary-container",
  "on-primary-container",
  "secondary",
  "on-secondary",
  "secondary-container",
  "on-secondary-container",
  "tertiary",
  "on-tertiary",
  "tertiary-container",
  "on-tertiary-container",
  "error",
  "on-error",
  "error-container",
  "on-error-container",
  "surface",
  "surface-dim",
  "surface-bright",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
  "surface-container-highest",
  "on-surface",
  "on-surface-variant",
  "outline",
  "outline-variant",
  "inverse-surface",
  "inverse-on-surface",
  "inverse-primary",
  "scrim",
] as const;

export type Role = (typeof ROLES)[number];
export type Scheme = Record<Role, string>;

const camel = (role: string) =>
  role.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) as keyof typeof M;

function toScheme(s: DynamicScheme): Scheme {
  const out = {} as Scheme;
  for (const role of ROLES) {
    const color = M[camel(role)] as (typeof M)["primary"];
    out[role] = hexFromArgb(color.getArgb(s));
  }
  return out;
}

/** Marca: primary = la semilla tal cual (fidelidad, el verde que ya conoce el
 * usuario); secondary = verde azulado sereno para Hoy; tertiary = ámbar cálido
 * (h 55) para Nutrición, el complementario amable del verde. Neutros con un
 * punto de verde para que las superficies no queden grises. */
export function brandScheme(dark: boolean): Scheme {
  const seed = Hct.fromInt(argbFromHex(BRAND_SEED));
  return toScheme(
    new DynamicScheme({
      sourceColorArgb: seed.toInt(),
      variant: 5, // Variant.FIDELITY (el enum no se exporta en 0.3.0)
      contrastLevel: 0,
      isDark: dark,
      primaryPalette: TonalPalette.fromHct(seed),
      secondaryPalette: TonalPalette.fromHueAndChroma(175, 24),
      tertiaryPalette: TonalPalette.fromHueAndChroma(55, 48),
      neutralPalette: TonalPalette.fromHueAndChroma(seed.hue, 6),
      neutralVariantPalette: TonalPalette.fromHueAndChroma(seed.hue, 10),
    }),
  );
}

/** Parejas texto/fondo que se pintan de verdad y deben dar ≥ 4,5:1. */
export const AA_PAIRS: readonly (readonly [Role, Role])[] = [
  ["on-primary", "primary"],
  ["on-primary-container", "primary-container"],
  ["on-secondary", "secondary"],
  ["on-secondary-container", "secondary-container"],
  ["on-tertiary", "tertiary"],
  ["on-tertiary-container", "tertiary-container"],
  ["on-error", "error"],
  ["on-error-container", "error-container"],
  ["on-surface", "surface"],
  ["on-surface", "surface-container-highest"],
  ["on-surface-variant", "surface"],
  ["on-surface-variant", "surface-container-highest"],
  ["primary", "surface"],
  ["primary", "surface-container-high"],
  ["tertiary", "surface"],
  ["secondary", "surface"],
  ["error", "surface"],
  ["inverse-on-surface", "inverse-surface"],
  ["inverse-primary", "inverse-surface"],
];

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG 2.x entre dos colores `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function failingPairs(scheme: Scheme): (readonly [Role, Role])[] {
  return AA_PAIRS.filter(([fg, bg]) => contrastRatio(scheme[fg], scheme[bg]) < 4.5);
}

/** Esquema de una receta a partir del color de su foto (fidelidad, para que
 * la pantalla se parezca a la foto). null si en claro u oscuro alguna pareja
 * no llega a AA: la pantalla se queda con su esquema de sección. */
export function recipeScheme(
  seed: number,
  check: (s: Scheme) => readonly (readonly [Role, Role])[] = failingPairs,
): { light: Scheme; dark: Scheme } | null {
  const hct = Hct.fromInt(seed);
  const light = toScheme(new SchemeFidelity(hct, false, 0));
  const dark = toScheme(new SchemeFidelity(hct, true, 0));
  return check(light).length || check(dark).length ? null : { light, dark };
}

/** Color semilla de una foto (RGBA ya reducida): cuantiza y puntúa como
 * `sourceColorFromImage`, sin necesitar el `<img>`; sin píxeles opacos, la
 * semilla de marca. */
export function seedFromPixels(rgba: Uint8ClampedArray): number {
  const pixels: number[] = [];
  for (let i = 0; i < rgba.length; i += 4)
    if (rgba[i + 3] === 255) pixels.push(argbFromRgb(rgba[i], rgba[i + 1], rgba[i + 2]));
  const brand = argbFromHex(BRAND_SEED);
  if (pixels.length === 0) return brand;
  return Score.score(QuantizerCelebi.quantize(pixels, 128), {
    fallbackColorARGB: brand,
  })[0];
}
