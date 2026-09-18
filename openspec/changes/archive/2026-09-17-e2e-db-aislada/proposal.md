# Change: e2e contra una base de datos propia

## Why

`pnpm e2e` corre contra el mismo D1 local que `pnpm dev`. El `webServer` de
Playwright arranca con la persistencia por defecto (`.wrangler/state`) en el
puerto 8787 y con `reuseExistingServer: true`, de modo que si hay un `pnpm dev`
vivo Playwright adopta *ese* servidor. Los tests crean sus datos con
`uniqueName()` y no existe teardown.

Medido en el estado local el 2026-09-17:

| Tabla | Total | Residuo e2e |
|---|---|---|
| `exercises` | 165 | 74 (los otros 91 son la semilla de `0004`/`0006`/`0007`/`0008`) |
| `recipes` | 30 | 30 |
| `plan_sessions` | 19 | 18 |

Los tests ya se defienden de su propio residuo: `strength.spec.ts` sortea la
fecha con `RUN_OFFSET = 30 + (Date.now() % 300)` y borra sesiones ajenas con
`clearDate()` antes de usar una fecha.

En CI esto no ocurre por accidente: el runner arranca sin `.wrangler/state`, así
que la base nace limpia y se le aplican las migraciones. La estrategia correcta
ya existe en el repo; no está aplicada en local.

## What Changes

- **Persistencia propia para e2e.** El `webServer` arranca `wrangler dev` con
  `--persist-to e2e/.state` en el puerto 8788 y `reuseExistingServer: false`.
  D1 y R2 (bucket `PHOTOS`) quedan fuera de `.wrangler/state`.
- **Base nacida de las migraciones en cada corrida.** La cadena de arranque
  borra `e2e/.state` y aplica `api/migrations/` en orden sobre un directorio
  vacío. Añadir una migración no requiere tocar nada bajo `e2e/`.
- **`workers: 1`.** Un solo servidor y una sola base por corrida: el
  paralelismo entre archivos es estado compartido y hoy ya produce una carrera
  real (ver design D3).
- **Datos de test reales.** Los tests resuelven los ejercicios del catálogo
  sembrado por nombre vía `GET /api/exercises` en vez de crearlos
  (`exercises.name` es UNIQUE: un `POST` con un nombre sembrado devuelve 400).
  Se crean por API solo las entidades ausentes de la semilla (recetas,
  plantillas, cardio). Fechas reales en vez de offsets por corrida.
- **Desaparecen los defensivos**: `uniqueName()` donde ya no aporta,
  `RUN_OFFSET`, `clearDate()`.
- **Guardia de aislamiento**: `e2e/scripts/isolation-check.ts` cuenta filas D1 y
  objetos R2 de `.wrangler/state` antes y después de `pnpm e2e` y falla si
  cambian.
- **CI**: se elimina el paso `Migraciones D1 locales`, redundante con la cadena
  de arranque.

## Affected Areas

| Area | Change |
|---|---|
| `e2e/playwright.config.ts` | Modified — cadena `webServer` con `--persist-to`, puerto 8788, `reuseExistingServer: false`, `workers: 1`, `baseURL` 8788 |
| `e2e/tests/helpers.ts` | Modified — helper de lookup por nombre en el catálogo |
| `e2e/tests/*.spec.ts` | Modified — catálogo por lookup, fechas reales, sin defensivos |
| `e2e/scripts/isolation-check.ts` | New — guardia de aislamiento (D1 + R2) |
| `e2e/package.json` | Modified — script `isolation-check` + `type: module` |
| `e2e/tsconfig.json` | Modified — `scripts` entra en el typecheck |
| `e2e/tests/setup.ts` | Modified — `__dirname` → `import.meta.dirname` |
| `package.json` (root) | Modified — script `e2e:check` |
| `.gitignore` | Modified — `e2e/.state/` |
| `.github/workflows/ci.yml` | Modified — quitar el paso de migraciones |
| `AGENTS.md` | Modified — convención de datos de test en e2e |

Sin cambios en `api/` ni en `web/`. Sin cambios de modelo de datos: este change
no añade ninguna migración; se apoya en que `api/migrations/` es la única fuente
de verdad del esquema.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Los specs reescritos cambien de comportamiento al perder `uniqueName()` | Medium | Ejecutar la suite completa serial antes/después y comparar el número de tests verdes |
| El arranque (rm + migraciones + build) supere el `timeout` del `webServer` | Low | `timeout: 180_000`; medir en la implementación |
| El puerto 8788 esté ocupado | Low | El script falla rápido con el error de wrangler |
| Al borrar el residuo se elimine algo que el usuario quiera conservar | Medium | Backup del sqlite + paso destructivo separado y explícito (tasks 5.2) |

## Rollback Plan

Revertir el commit: `playwright.config.ts`, los specs, `helpers.ts`, el script de
guardia, `.gitignore`, `ci.yml` y `AGENTS.md`. Nada de `api/` ni de `web/`
cambia, no hay migraciones ni datos productivos implicados; el estado de
desarrollo sigue en su sitio porque este change nunca escribe en él.

## Dependencies

Ninguna nueva. `wrangler` (4.128.0), `@playwright/test` y Node 24 (que ejecuta
`.ts` sin build, como ya hace `api/scripts/ensure-dev-vars.ts`).

## Success Criteria

- [ ] `pnpm e2e` en verde con `workers: 1`, con y sin `pnpm dev` corriendo.
- [ ] Tras `pnpm e2e`, los conteos de `.wrangler/state` (D1 y R2) son idénticos
      a los de antes.
- [ ] Dos corridas consecutivas verdes sin borrar nada entre ellas.
- [ ] Añadir una migración de prueba no obliga a tocar nada bajo `e2e/`.
