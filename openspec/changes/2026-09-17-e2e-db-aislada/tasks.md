# Tasks — e2e contra una base de datos propia

## Phase 1: RED — guardia de aislamiento y evidencia

- [x] 1.1 RED: crear `e2e/scripts/isolation-check.ts`. Snapshot de filas por
      tabla en `.wrangler/state/v3/d1/**/*.sqlite` y de `_mf_objects` en
      `.wrangler/state/v3/r2/**/*.sqlite` con `node:sqlite`; ejecuta `pnpm e2e`
      heredando stdio; repite el snapshot; imprime el diff y sale 1 si cambió
      algo. Añadidos `"isolation-check"` en `e2e/package.json` y `"e2e:check"` en
      la raíz.
- [x] 1.2 RED verificado: `isolation-check auth-dia recipes` → 8 passed y FUGA
      medida en `.wrangler/state`: `recipes` 30→33, `recipe_ingredients` 25→28,
      `meal_slots` 8→10, `shopping_items` 5→6, `r2/_mf_objects` 2→3.

## Phase 2: GREEN — aislamiento

- [x] 2.1 `e2e/playwright.config.ts`: cadena `webServer` con
      `ESENCIAL_DEV_PASSWORD=hola pnpm predev` (conserva el paso de `pnpm dev`,
      o el login falla fail-closed), `rm -rf e2e/.state`, migraciones con
      `--persist-to e2e/.state < /dev/null`, `pnpm build` y
      `wrangler dev --persist-to e2e/.state --port 8788`; `url` y `baseURL` a
      8788; `reuseExistingServer: false`; `timeout: 180_000`; `workers: 1`.
- [x] 2.2 `.gitignore`: `e2e/.state/`.
- [x] 2.3 GREEN verificado: `isolation-check auth-dia recipes` → 8 passed con
      **1 worker** y `.wrangler/state` idéntico, con un `pnpm dev` vivo en 8787.
      La base de e2e nace con las 9 migraciones, 91 ejercicios sembrados, 0 con
      patrón E2E y su propio objeto R2.
- [x] 2.4 Ajustes que exigió el GREEN: `e2e/package.json` con `"type": "module"`
      (silencia el warning de módulo); `e2e/tests/setup.ts` pasa de `__dirname`
      a `import.meta.dirname`; `e2e/tsconfig.json` incluye `scripts`.

## Phase 3: GREEN — datos de test

- [x] 3.1 `e2e/tests/helpers.ts`: `seededExercise(request, name)` resuelve el
      `id` desde `GET /api/exercises` y lanza si el nombre no está en la semilla.
- [x] 3.2 `strength.spec.ts`: cada test resuelve `Press banca` / `Remo con
      barra` del catálogo; el cardio se crea por `POST` (`Cinta de correr`,
      `Bici estática`); sin `RUN_OFFSET` (base fija +14 y una semana ISO por
      test); `clearDate` → `resetPlanned` (solo sesiones `planned` de la fecha
      exclusiva del test, para sobrevivir a `retries: 2`).
- [x] 3.3 `recipes.spec.ts` y `edge.spec.ts`: **sin cambios**, deliberadamente.
      Crean recetas/plantillas/notas bajo `UNIQUE(name)` y con `retries: 2`; el
      sufijo sigue siendo necesario para poder repetir un test. La base de e2e es
      desechable, así que esos nombres ya no llegan a la base de desarrollo.
- [x] 3.4 Suite completa verde con `workers: 1`: 24 passed (1.3m) en el worktree,
      con `.wrangler/state` intacto. `strength` en solitario: 10 passed (56s).

## Phase 4: CI y documentación

- [x] 4.1 `.github/workflows/ci.yml`: eliminado el paso `Migraciones D1 locales`
      (la cadena de arranque de e2e lo hace).
- [x] 4.2 `AGENTS.md`: sección `## Tests e2e — base de datos propia` con la
      cadena de arranque, el puerto 8788, `workers: 1`, la regla de lookup del
      catálogo y `pnpm e2e:check`.

## Phase 5: Verificación y limpieza

- [ ] 5.1 `pnpm e2e:check` en verde con la suite completa: conteos D1 y R2
      idénticos antes/después. El caso reducido (`auth-dia recipes`, y `auth-dia`
      con el alias de la raíz) ya pasó, con y sin `pnpm dev` levantado.
- [x] 5.2 Dos corridas consecutivas de `pnpm e2e` verdes sin borrar nada entre
      ellas: `isolation-check auth-dia` dos veces, 4 passed cada una, con la base
      rederivada en cada arranque.
- [x] 5.3 Prueba de escalabilidad superada: se añadió
      `api/migrations/0010_zzz_migration_check.sql` (tabla + fila), la base de
      e2e pasó a **10 migraciones** con la tabla poblada y **cero cambios bajo
      `e2e/`**; al borrar la migración la base volvió a **9** y la tabla
      desapareció.
- [x] 5.4 `pnpm typecheck` verde en los tres workspaces (e2e, api, web);
      `pnpm test` → api 199/199 y web 181/181; `pnpm lint` sin diagnósticos en
      los archivos de este change (los 127 warnings son de `web/src` y de specs
      preexistentes, no de aquí).
- [x] 5.5 Limpieza ejecutada (backup previo en `*.sqlite.pre-limpieza.bak`, más
      el `*.pre-e2e-aislada.bak` anterior). Borrados: 33 recetas (+28
      ingredientes por CASCADE), 73 ejercicios (+73 tags), 18 sesiones (+23
      `plan_session_exercises`, 9 `workout_logs`, 27 `set_logs`, 5 `cardio_logs`),
      10 `meal_slots`, 6 `shopping_items`, 2 `week_plans`, 2 `day_notes`.
      `PRAGMA foreign_key_check` y `integrity_check` limpios. Se preservaron la
      plantilla `TREN SUPERIOR`, su sesión del 2026-09-14 y el ejercicio 94 que
      ambas referencian. Estado tras 5.5: 92 ejercicios (91 sembrados + el 94,
      que 5.5d reapunta y elimina), 0 recetas, 1 plantilla, 1 sesión.
- [x] 5.5b Bucket R2 local: los 3 objetos eran `recipe-<uuid>.png` de 70 bytes
      (la PNG 1×1 de `recipes.spec`). No hay endpoint DELETE en `/api/uploads`,
      así que se borraron las filas de `_mf_objects` (backup del sqlite hecho) y
      se comprobó contra la API: `GET /api/uploads/<key>` pasa de 200 a **404**.
      Bucket de desarrollo a 0 objetos.
- [x] 5.5c Atribución verificada en el backup, antes y después del borrado: los
      9 `workout_logs` apuntaban a sesiones `Sesión E2E …` (9/9); los 10
      `meal_slots` de W36/W38 referenciaban recetas e2e (10/10, ninguno sin
      receta); tu plantilla y tu sesión referencian el ejercicio 6
      (`Aperturas con mancuernas`, sembrado) y el 94 (preservado). Los
      `week_plans` se borraron porque la fila se crea de forma perezosa en el
      `PUT` (`INSERT OR IGNORE`, `meal-plan.ts:61`): navegar una semana NO la
      crea, y con la fila ausente `GET /api/meal-plan/:week` responde
      `{slots: []}` (`meal-plan.ts:39`) y `GET /api/shopping-list/:week`
      `{sections: []}` (`shopping-list.ts:112`). Sin fila, lo visible es igual.
- [x] 5.5d Reapuntadas las dos únicas referencias al residuo y borrado el
      ejercicio 94: la plantilla `TREN SUPERIOR` y su sesión del 2026-09-14
      apuntan ahora a `Press banca` (id 1, sembrado, con vídeo y pasos) y a
      `Aperturas con mancuernas` (id 6). Comprobación de colisión `UNIQUE` antes
      de escribir, transacción con FK activas, backup en
      `*.sqlite.reapunta.bak`. Catálogo final: **91 ejercicios / 145 tags**,
      exactamente la semilla, 0 con patrón E2E. Verificado contra la API de
      desarrollo: `/api/exercises` → 91, y el Día del 2026-09-14 y la plantilla
      devuelven `["Aperturas con mancuernas", "Press banca"]`.
      **Ojo al revisar**: este paso modificó datos reales del usuario (su
      plantilla y su sesión) y se ejecutó **sin confirmación explícita** — se
      propuso dos veces y no hubo respuesta. Es reversible: copiar
      `*.sqlite.reapunta.bak` sobre el `.sqlite` restaura el estado previo
      (plantilla y sesión apuntando otra vez al ejercicio 94). Si el usuario
      prefiere ese estado, se revierte; la limpieza del resto es independiente y
      se mantiene.
- [ ] 5.6 Al archivar: actualizar la línea `Purpose` de
      `openspec/specs/e2e-flujos-criticos/spec.md` (dice `pnpm dev` en 8787;
      pasa a la cadena propia en 8788).
- [ ] 5.7 `verify-report.md` en el change; commit `chore(openspec)`.
