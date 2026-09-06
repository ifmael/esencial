# TODO — Flujo productivo y seguro

Pendiente de abordar por fases, una a una.

## Fase 1 — CI en GitHub Actions

En cada push/PR a `main`: instalar pnpm + Node 24, `pnpm install --frozen-lockfile`,
correr `pnpm test` (unit: api + web) y `pnpm e2e` (Playwright con wrangler dev).

Opciones:

- **A (mínima):** solo unit + typecheck en CI; e2e queda local. Rápido (~2 min por run), sin coste de minutos de Actions.
- **B (completa):** unit + typecheck + e2e con `pnpm e2e` en CI. Requiere Chrome/Brave en el runner (Playwright instala chromium: `npx playwright install --with-deps chromium`) y ajustar `executablePath` de `e2e/playwright.config.ts` (hoy apunta a `/usr/bin/brave-browser`).
- **C (matriz):**jobs separados por workspace (api / web / e2e) para paralelizar y fallos aislados. Más config, útil solo si el suite crece.

Criterio: empezar por B; si los minutos de Actions o flakiness de e2e molestan, degradar a A.

## Fase 2 — Typecheck

`vite build` transpila sin verificar tipos: errores de TS llegan a producción.
Añadir script `typecheck` (`tsc --noEmit`) en api, web y e2e, y un agregador en
la raíz (`pnpm -r typecheck`). Se engancha al workflow de la Fase 1.

Opciones:

- **A:** `tsc --noEmit` por workspace, agregado con `pnpm -r`.
- **B:** añadir el typecheck al `build` (`tsc --noEmit && vite build`) para que también aplique en deploy manual.

Criterio: A siempre; B además si se quiere bloquear el build con errores de tipos.

## Fase 3 — Lint / format

No hay eslint/biome/prettier. Solo hace falta una config y un binario.

Opciones:

- **A (Biome):** una herramienta para lint + format, config única, muy rápido. Recomendado para un repo de este tamaño.
- **B (ESLint + Prettier):** estándar del ecosistema, más plugins disponibles (react-hooks, etc.), dos configs y más deps.
- **C:** nada — solo Prettier para formato consistente, sin lint.

Criterio: A por defecto. Enganchar a CI (job aparte o paso del workflow) y `pnpm format` / `pnpm lint` en scripts raíz.

**HECHA (local, rama `ifmael/fase3-lint`):** `@biomejs/biome@2.5.12` en raíz,
`biome.json` (comillas dobles, 2 espacios, `a11y: warn`, `project-site/` y
`wireframes/` excluidos), scripts `lint` / `lint:fix` / `format`. El job de CI
se añadirá al workflow de la Fase 1 cuando esa rama se integre.

## Fase 4 — Deploy automático

Hoy: `npm run deploy` manual desde este PC.

Opciones:

- **A (Workers Builds):** conectar el repo en el dashboard de Cloudflare (Workers → Settings → Build). Despliega `main` en cada push sin secretos en GitHub. Cero YAML.
- **B (GitHub Action):** workflow con `cloudflare/wrangler-action`, secretos `CLOUDFLARE_API_TOKEN` (scope: Workers Scripts:Edit + D1:Edit) y `CLOUDFLARE_ACCOUNT_ID` en GitHub. Más control: puede depender de que CI pase (`needs:`) y desplegar solo en tags.
- **C (híbrido):** CI en Actions valida, y el deploy se sigue haciendo manual. Útil si se prefiere no dar permisos de escritura a GitHub.

Criterio: A por simplicidad; B si se quiere deploy condicionado a CI verde o desde tags. Las migraciones D1 (`db:migrate:remote`) siguen siendo paso manual o paso extra del pipeline.