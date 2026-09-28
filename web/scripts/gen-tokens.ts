// Congela en `src/tokens.css` los valores que salen de cálculo: el esquema
// tonal M3 de la semilla de marca (claro y oscuro) y los muelles M3E
// muestreados en `linear()`. Se corre a mano cuando cambia la semilla o un
// muelle, y el resultado se versiona: en tiempo de ejecución no se calcula
// nada. `tests/tokens.test.ts` falla si el fichero no coincide con esto.
//
//   node web/scripts/gen-tokens.ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AA_PAIRS,
  BRAND_SEED,
  brandScheme,
  contrastRatio,
  ROLES,
} from "../src/lib/color-scheme.ts";
import { SPRINGS, springCurve, toLinear } from "../src/lib/spring.ts";

export function tokensCss(): string {
  const light = brandScheme(false);
  const dark = brandScheme(true);
  const colors = (s: Record<string, string>) =>
    ROLES.map((r) => `  --color-${r}: ${s[r]};`).join("\n");
  const springs = Object.entries(SPRINGS)
    .map(([name, spring]) => {
      const { points, durationMs } = springCurve(spring);
      return [
        `  /* k=${spring.stiffness}, ζ=${spring.dampingRatio} (ω=${Math.sqrt(spring.stiffness).toFixed(1)} rad/s) */`,
        `  --ease-${name}: ${toLinear(points)};`,
        `  --duration-${name}: ${durationMs}ms;`,
      ].join("\n");
    })
    .join("\n");
  const aa = (s: Record<string, string>) =>
    AA_PAIRS.map(
      ([f, b]) => `   ${f} / ${b}: ${contrastRatio(s[f], s[b]).toFixed(2)}`,
    ).join("\n");

  return `/* GENERADO por web/scripts/gen-tokens.ts — no editar a mano.
   Esquema tonal M3 desde la semilla ${BRAND_SEED} y muelles M3E (esquema
   expressive) muestreados en linear(). Contraste WCAG de cada pareja
   texto/fondo (todas ≥ 4,5):
   claro
${aa(light)}
   oscuro
${aa(dark)}
*/

:root {
${colors(light)}
${springs}
}

:root[data-theme="dark"] {
  color-scheme: dark;
${colors(dark)}
}
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = fileURLToPath(new URL("../src/tokens.css", import.meta.url));
  writeFileSync(out, tokensCss());
  console.log(`escrito ${out}`);
}
