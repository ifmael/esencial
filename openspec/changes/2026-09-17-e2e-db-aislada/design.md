# Design — e2e contra una base de datos propia

## Contexto medido (2026-09-17, estado local)

- `exercises`: 165 filas, 74 con el patrón `*E2E *-*`; las otras 91 son la
  semilla (`0004`/`0006`/`0007`/`0008`), todas `kind='strength'`.
- `recipes`: 30, todas residuo. `plan_sessions`: 19, 18 residuo.
- Bucket local `PHOTOS`: 2 objetos (`_mf_objects`), de las 2 recetas con
  `photo_path`.
- `wrangler dev` y `d1 migrations apply` aceptan `--persist-to` en 4.128.0.
- CI ya aplica las migraciones antes de `pnpm e2e`; su runner no tiene
  `.wrangler/state`, así que allí la fuga no existe.

## D1 — Persistencia y puerto dedicados

**Decisión**: `--persist-to e2e/.state` + `--port 8788` +
`reuseExistingServer: false`, encadenados en `webServer.command`.

**Alternativas descartadas**:

- Mantener 8787 con `reuseExistingServer: true`: si hay un `pnpm dev` vivo,
  Playwright adopta *ese* servidor y e2e escribe en la base del usuario. Es la
  mitad de la causa del residuo actual.
- Copiar `.wrangler/state` antes y restaurarlo después: restaurar con un
  servidor vivo es inconsistente y no da determinismo.

**Rationale**: `--persist-to` es una bandera nativa de wrangler, cubre D1 **y**
R2 de una sola vez, y no añade ninguna capa nueva. La cadena de arranque queda
como único lugar que sabe cómo nace la base de e2e.

## D2 — La base nace de las migraciones, en cada corrida

**Decisión**: `rm -rf e2e/.state` + `wrangler d1 migrations apply esencial
--local --persist-to e2e/.state < /dev/null`, antes del build y del server.

**Alternativas descartadas**:

- Base de e2e persistente + wipe de tablas: la lista de tablas es justo el
  artefacto que se desincroniza en cuanto una migración añade una tabla, y el
  requisito es que añadir migraciones no dé trabajo extra.
- `fixtures.sql` con `d1 execute`: bypassa la validación de la API, así que
  puede crear estados que la API rechazaría, y hay SQL a mano que se rompe con
  cada cambio de esquema.
- D1 remota `esencial-test` (`--remote --env test`): aislada y compartible, pero
  exige una segunda base en la cuenta, credenciales en CI y latencia por
  request. No aporta aislamiento adicional sobre un directorio local.

**Rationale**: la base de e2e pasa a ser **derivada** de `api/migrations/`, que
ya es la única fuente de verdad del esquema y de los datos sembrados. Una
migración nueva entra sola. Además es exactamente lo que CI ya hace, así que
local y CI dejan de divergir.

**Gotcha**: `< /dev/null` por el prompt `(Y/n)` de wrangler en TTY
(AGENTS.md, problema conocido 2).

**Credenciales**: la cadena conserva el `predev` que hacía `pnpm dev`
(`ESENCIAL_DEV_PASSWORD=hola pnpm predev`). El `setup` de Playwright hace login
con la password `hola`, y sin ese paso un clon limpio no tendría `.dev.vars`: el
guard de auth falla cerrado y el login devuelve 500. `hola` es la password de
desarrollo documentada en AGENTS.md; `AUTH_SECRET` se conserva entre corridas.


## D3 — `workers: 1`

**Decisión**: ejecución serial.

**Rationale**: dentro de una corrida hay **un** servidor y **una** base, así que
el paralelismo entre archivos no compra aislamiento, compra estado compartido.
Carrera real, confirmada leyendo los specs: `auth-dia.spec.ts:47` afirma que hoy
no hay comidas planificadas y `recipes.spec.ts:81` planifica en el lunes de la
semana actual. Si la corrida cae en lunes, uno de los dos falla. Aislar la base
no lo arregla: el choque es del mismo run.

**Alternativas descartadas**:

- Namespacing por archivo (prefijo propio + rango de fechas propio): aguanta
  hasta que alguien añade un spec y rompe la regla en silencio; la carrera del
  lunes sigue ahí.
- Un servidor y una base por worker: Playwright tiene **un** `webServer`; haría
  falta arrancar N wrangler dev en N puertos y enrutar por worker. Complejidad
  alta para 18 tests.

**Corrección de una hipótesis previa**: la carrera de NOTAS entre `auth-dia` y
`edge` **no existe**. `auth-dia:60` comprueba `getByPlaceholder(...)`, que
matchea por atributo, y un textarea con texto sigue visible. Solo se documenta
la de comidas.

**Sin cambios**: `retries: 2` se queda. Ya no filtra residuo a ninguna base y no
es parte de este change.

## D4 — Datos de test desde el catálogo sembrado

**Decisión**: resolver el `id` con `GET /api/exercises` y seleccionar por nombre
en memoria. `POST /api/exercises` solo para lo que no está en la semilla.

**Rationale**: `exercises.name` es UNIQUE (`api/schema.sql:37`). Un
`POST {name: "Press banca"}` sobre la base recién migrada devuelve **400**:
`0004_seed_exercises.sql` ya lo insertó. La semilla tiene 91 ejercicios y todos
son `kind='strength'`, lo que da la regla completa:

| Entidad | Cómo se obtiene |
|---|---|
| Ejercicio de fuerza | Lookup por nombre; uno distinto por test (91 disponibles, serial → sin colisiones) |
| Ejercicio cardio | `POST` con `kind: "running"`/`"bike"` y tag `cardio` (ninguno sembrado → sin colisión) |
| Receta, plantilla | `POST` por test, con nombre de producto distinto por test |

**Alternativas descartadas**:

- `uniqueName()` universal: obliga a arrastrar el sufijo en cada aserción de la
  UI y hace ilegibles los nombres de los datos de test.
- `e2e/seed.ts` (seed de e2e por API): ahorra verbosidad a cambio de un
  artefacto compartido que hay que tocar cada vez que un test cambia. Añadirlo
  después es barato; quitarlo con diez tests encima, no.

**Implementado (fase 3)**: `strength.spec.ts` resuelve sus ejercicios con
`seededExercise(page.request, "Press banca")`; las 48 llamadas que antes creaban
`"Banca E2E <epoch>-<rand>"` ahora usan el catálogo. El cardio se sigue creando
por `POST` porque no hay ninguno sembrado (todos los sembrados son
`kind='strength'`).

**Lo que NO se migró, y por qué**: `recipes.spec.ts` y `edge.spec.ts` conservan
`uniqueName()` para recetas, plantillas y notas. Son INSERT bajo `UNIQUE(name)` y
con `retries: 2` un reintento debe poder repetir el test, así que ahí el sufijo
sigue ganándose el sitio. Como la base de e2e ya es desechable, esos nombres no
vuelven a aparecer en la base de desarrollo — que era el problema real.

## D5 — Fechas reales

**Decisión (implementada)**: `BASE_OFFSET = 14` sobre hoy y, para cada test que
escribe una sesión, **su propia semana ISO** (offsets múltiplos de 7). Así dos
tests nunca compiten por la misma fecha — `plan_sessions.date` es UNIQUE — y
ninguno escribe en hoy, sin depender del día de la semana en que se corra.

**Rationale**: con la base limpia por corrida no hay residuo que sortear, así que
`RUN_OFFSET = 30 + (Date.now() % 300)` desaparece: era aleatoriedad para esquivar
los datos de intentos anteriores.

**`clearDate` → `resetPlanned`**: el borrado por fecha sin más desaparece; queda
un reset acotado a sesiones `planned` de la fecha **exclusiva** del propio test.
El motivo es `retries: 2`: un reintento reencuentra su sesión ya guardada y el
`POST` daría 409. No puede tocar datos de otro test porque ninguna fecha se
comparte, ni de otra corrida porque la base nace vacía.

**Caveat**: varios specs dependen de "hoy" (el Día muestra hoy; `recipes`
planifica la semana actual). Con serial el orden por nombre de archivo es
estable (`auth-dia` antes que `recipes`), pero un test que asuma "hoy vacío" y
corra después de uno que escribe en hoy es un fallo latente: los tests que
escriben en hoy no pueden dejar estado que otro test espere ausente.

## D6 — Verificación de la propiedad ("no se mezcla")

**Decisión**: `e2e/scripts/isolation-check.ts` — snapshot de filas de todas las
tablas D1 de `.wrangler/state` + objetos R2 (`_mf_objects` del sqlite de
`miniflare-R2BucketObject`), ejecuta `pnpm e2e`, repite el snapshot y sale con
código 1 si algo cambió. Expuesto como `pnpm e2e:check`.

**Rationale**: "no mezcla bases" es la afirmación central del change y hasta
ahora era una promesa sin comprobación. R2 entra en el conteo porque
`recipes.spec.ts` sube una foto, así que la fuga no es solo relacional. Es el
único artefacto nuevo que el change añade, y existe porque sin él la propiedad
no es verificable.

**Límite conocido**: en CI no sirve (el runner no tiene estado de desarrollo
previo); es una guardia local.

## Notas de migración SQLite

Ninguna. Este change no añade, modifica ni elimina migraciones, y no toca
`api/schema.sql`. Fija la convención inversa: `api/migrations/` es la fuente de
verdad del esquema y de los datos sembrados, y la base de e2e se **deriva** de
ella en cada corrida. Un cambio de modelo futuro es un archivo nuevo en
`api/migrations/` más su reflejo en `api/schema.sql`, sin tocar `e2e/`.

## Fuera de alcance

`api/tests/helpers.ts` mantiene la lista `TABLES` hardcodeada que usa
`freshDb()`: una migración que añada una **tabla** no se limpia entre archivos
de test — el mismo modo de fallo que descartamos en D2, un piso más abajo. No se
propone aquí porque **ya está en curso en el árbol de trabajo** (el diff sin
commitear añade `cardio_logs`, `set_logs` y `plan_session_exercises` a esa
lista).

## Coordinación con el trabajo en curso

Al escribir este change, el árbol tenía 34 archivos modificados sin commitear
(fuerza v2 / planificador semanal), incluido un rewrite de
`e2e/tests/strength.spec.ts` (276+/293−). Ese archivo es el único solape
material: la fase 3 de `tasks.md` no puede reescribirlo hasta que ese trabajo
esté cerrado. El resto del change (`playwright.config.ts`, `.gitignore`,
`ci.yml`, el script de guardia) toca archivos limpios.

**Estado de implementación**: fases 1, 2 y 4 completas y verificadas (RED→GREEN
con `auth-dia recipes`; 8 passed, 1 worker, `.wrangler/state` intacto con un
`pnpm dev` vivo en 8787). La fase 3 queda bloqueada por lo anterior, así que
hoy los specs siguen usando `uniqueName()`, `RUN_OFFSET` y `clearDate()`: el
aislamiento ya está hecho, la legibilidad de los datos de test todavía no.


