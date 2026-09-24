# AGENTS.md — Esencial

Memoria del proyecto para agentes. Lee esto antes de tocar el repo; actualízalo
cuando descubras algo que no esté en los specs.

## Qué es y stack

App de bienestar personal (recetas + plan de fuerza) en **dos Workers** de
Cloudflare: uno sirve el SPA y gatea el HTML, el otro expone la API.

- `api/` — backend **Hono** sobre **Cloudflare Workers** (Worker `esencial-api`),
DB **D1** (SQLite) y R2 para las fotos.
- `web/` — SPA **React 19** + **Vite** + **react-router 7** + **Tailwind**; el
Worker del frontal (`esencial`) sirve los assets y gatea el HTML.
- Monorepo **pnpm**. **Dos despliegues** (B'): el navegador habla con los dos
Workers por separado.

## Convenciones del proyecto

- **Conventional commits** solamente. **NUNCA** añadir `Co-Authored-By` ni
atribución de IA a los commits.
- **TDD estricto (RED→GREEN)**: cada cambio empieza con un test que falla y
termina con el test verde
- **Verifica antes de afirmar**: si no estás seguro de un dato técnico. No confirmes sin verificar.
- **Respuestas concisas por defecto**: mínimo útil; expande solo si se pide o la
tarea lo requiere.
- **Propón alternativas con tradeoffs** cuando haya un cruce real de diseño.
- La UI y los datos van en **español**; nombres de ejercicios/recetas en español.

## Sistema de diseño (UI)

**La fuente única es `web/src/globals.css`.** Tres capas, con un solo dueño cada
una:

1. `:root` — valores crudos (colores, escala tipográfica, ritmo de espaciado,
   radios, sombras, movimiento) y los pocos derivados (`--color-primary-soft`,
   `--color-ring`).
2. `@theme inline` — el puente a Tailwind: convierte esos tokens en utilidades
   (`text-lead`, `p-card`, `gap-section`, `rounded-card`, `shadow-raised`…).
3. `@layer components` — la piel de las piezas reutilizables (`.card`, `.btn-*`,
   `.input`, `.badge-*`, `.section-label`, `.list-row`, `.skeleton`).

Las pantallas consumen **las primitivas** de `web/src/components/ui.tsx`
(`Button` —`primary`/`secondary`/`ghost`/`danger`—, `Card` —con `featured`—,
`Input`, `Textarea`, `Select`, `Badge`, `Chip`, `Kbd`, `Alert`); los iconos
salen de `web/src/components/icons.tsx` (SVG en línea, sin dependencia).

Las clases del punto 3 son la **piel** de esas primitivas: una pantalla no las
escribe a mano (para un `<Link>` o un `<li>` están `buttonClass`, `cardClass` y
`chipClass`). Hay seis utilidades compartidas que sí se aplican tal cual,
porque no son piel de ningún componente: `.section-label`, `.list-row`,
`.card-interactive` (como modificador de `Card`), `.skeleton`, `.scrim` (velo
de las modales) y `.reveal` (aparición ligada al scroll).

**Al añadir algo nuevo:** reutiliza una primitiva existente. Si no encaja, añade
primero el token (`:root` + `@theme inline`) y después la primitiva. **Nunca un
valor suelto** en una clase arbitraria (`rounded-[7px]`, `text-[10px]`) ni la
piel de una primitiva escrita a mano (`className="card"`, `btn-primary`):
`pnpm lint` rechaza las dos cosas (ver `web/scripts/check-design-tokens.ts`). Se
aceptan los valores derivados (`var(...)`, `calc(...)`, `env(...)`), porque no
inventan una escala.

Escala vigente (dirección E «minimal preciso») — todo lo demás sale de aquí:

| Familia | Tokens |
| --- | --- |
| Tipografía | Geist (auto-alojada, subset latino) · `micro` 11 · `caption` 13 · `body` 14 · `lead` 15 · `title` 18 · `display` 26; `font-mono` (Geist Mono) para cifras y metadatos |
| Espaciado | `stack` 10 · `gutter` 16 · `card` 16 · `section` 24 |
| Radios | `control` 6 · `panel` 8 · `card` 12 · `chip` 999 |
| Elevación | `shadow-card`, `shadow-raised`, `shadow-inset` (casi nulas: el borde de 1px hace el trabajo) |
| Movimiento | `fast` 120ms · `base` 160ms · `slow` 240ms, con **un solo** easing (`ease-out-quart`) |

- **Claro y oscuro con los mismos tokens**: cada color de `:root` es un
  `light-dark()`, y `color-scheme` decide. Sin elección sigue a
  `prefers-color-scheme`; el conmutador del menú (y la acción «Cambiar tema» de
  la paleta) fija `data-theme` en `<html>` y lo guarda en `esencial.theme`
  (`web/src/lib/theme.ts`). Un color nuevo se declara con sus dos valores.
- **Un solo acento** (`--color-primary`): solo rellena el botón primario y
  marca activo y foco. Las etiquetas de receta/ejercicio van en `Badge` neutro.
- **Halo**: un único listener pasivo (`web/src/lib/pointer-halo.ts`) escribe
  `--mx`/`--my` en la tarjeta bajo el puntero; lo pinta `.card::before`, solo
  con `(hover: hover) and (pointer: fine)`.
- **Paleta de comandos ⌘K / Ctrl+K** (`web/src/components/command-palette.tsx`,
  lógica pura en `web/src/lib/command-palette.ts`): combobox + listbox dentro
  de un diálogo modal; recetas y ejercicios se piden al abrirla. Una pantalla
  o acción nueva se añade a `STATIC`.
- Un único anillo de foco para toda la app (`:focus-visible`), y el error de un
  campo se marca con `aria-invalid` — gancho de estilo y de lector de pantalla a
  la vez, sin estado duplicado en una clase aparte.
- Todo lo animado se neutraliza con `prefers-reduced-motion`; `.reveal` además
  solo existe tras `@supports (animation-timeline: view())`.
- Catálogo de variantes en la ruta **`/ui`** (en el menú, junto a «Cerrar
  sesión»): míralo antes de inventar una pieza.
- `wireframes/DESIGN.md` sirve para generar maquetas; donde discrepe de
  `globals.css`, manda `globals.css`.
- El sistema explicado con muestras en vivo (colores, escala, movimiento) vive en
  el sitio de arquitectura: `docs/architecture/diseno.html`, que se abre con
  doble clic, sin build. Ojo: esa página aún muestra la escala y la paleta de la
  dirección anterior; mientras no se actualice, mandan `globals.css` y la ruta
  `/ui`.

### Pantallas de calendario (fuerza y comidas)

`/plan-fuerza` y `/plan-recetas` van sin cabecera: el calendario es el
protagonista y ocupa la altura de la ventana en escritorio (sin scroll de
página), con un hueco vacío reservado abajo para acciones futuras. Las dos rutas
están en `CALENDAR_ROUTES` (`web/src/components/shell.tsx`): añadir una ahí le da
el mismo trato (sin título, alto completo, hueco inferior).

En esas rutas **la barra lateral se colapsa a un raíl de iconos** (`w-18` = 72px,
iconos con el nombre en `aria-label`/`title`, sin desplegables) y su ancho es
para la rejilla; el submenú de la sección queda como **fila de chips sobre el
calendario**, en escritorio y en móvil (donde no hay raíl). El `main` de estas
rutas es `max-w-calendar` —el token `--container-calendar`, 110rem = 1760 px—
con `lg:px-6` en vez de `max-w-6xl` + `lg:px-8`. Medido a
1280×800: columna de día **154 px** con la dirección E (152,84 con la escala
anterior; 124,28 con la barra de 256px): tarjetas de 16px de relleno en vez de
20 dejan 1 px más por columna. Espacio de texto por nombre ~2,2× respecto a la
barra ancha, sin scroll de página ni horizontal (`scrollHeight` 800,
`scrollWidth` 1280), y la confirmación Sí/No de la ✕ cabe en la fila (44 px de
alto, 8 px de margen al borde de la columna). Techo del ancho: a 1280 no
cabe más de ~154 px por columna con el raíl; con títulos largos (>20 caracteres)
el `truncate` de las celdas sigue recortando (decisión explícita de no tocar las
celdas). Móvil y tablet no cambian: el raíl solo existe desde `lg`.

Las dos pantallas comparten la **rejilla semanal** (`web/src/components/week-grid.tsx`):
un único contenedor con la navegación de semana y las siete columnas, con la
columna de «hoy» marcada. El componente no sabe nada del dominio: cada página
inyecta el contenido de sus días por el render prop (`children`), que es lo
único que difiere (sesiones en fuerza, tomas en comidas).

En la columna de un día de fuerza (`SessionCell`, `web/src/routes/plan-fuerza.tsx`)
los ejercicios **se reparten la altura de la columna** en vez de quedarse
apiñados arriba: la lista (`<ol>`) se queda con el espacio libre y cada fila
(`flex-1`, `min-h-11`) es un bloque `bg-surface-muted` con el nombre en
`text-body` —hasta dos líneas (`line-clamp-2`), así que cabe el nombre entero de
casi todo el catálogo— y el objetivo (`targetSummary`, «4 series») debajo en
`text-caption`. Con muchas filas el mínimo manda y el desborde sigue quedando
dentro del calendario (lo cubre `calendar-layout.spec.ts`).

Cada fila lleva su propia **✕ para desprogramar ese ejercicio** sin abrir el
modal: la fila se convierte en su confirmación en línea (nombre truncado +
**Sí/No**, con el nombre completo en el `aria-label`) y, al confirmar, el día se
guarda con el mismo PUT de los items que usa el arrastre (`usePlanWeek.saveItems`,
optimista y con recarga). Los dos botones van en **una sola línea** a propósito:
la columna mide ~154 px y dos botones de texto largo (`size="sm"` = `px-3` +
`text-caption`, ~86 y ~77 px) se salían de la fila y quedaban tapados por el día
siguiente — de ahí las etiquetas cortas. Quitar el **último** ejercicio deja el
día sin items, que no es representable (la API exige ≥1): desprograma la sesión
(DELETE) y el día vuelve a su «+ añadir», igual que con la ✕ de la sesión.

### Modal de plantillas (crear y editar)

`app.tsx` registra **`/plantillas/*`** y `PlantillasPage` decide con `useMatch`
si además pinta la modal, así que la lista nunca se desmonta: `/plantillas/nueva`
y `/plantillas/:id/editar` funcionan al recargar, y «atrás» o Escape vuelven a
`/plantillas`. Dentro hay un **único** `role=dialog`: a la izquierda el borrador
con los ejercicios ordenables por asa (`web/src/components/sortable.tsx`, ratón,
táctil y teclado) y a la derecha el selector **embebido** (búsqueda, mapa
muscular y grupos plegables) — nunca una segunda modal encima. Guardar manda un
solo POST (crear) o PUT (editar) con las posiciones 0..n-1; Cancelar, Escape o el
fondo descartan el borrador sin llamadas a la API.

La modal mide **siempre lo mismo** (`h-[88vh]`, `max-w-6xl`; nada de `max-h`), así
que no se redimensiona al cambiar el borrador ni la lista del selector. Desde
`md`, dentro de la columna derecha el **mapa muscular se lleva el alto libre**
(`md:h-full`, `w-auto`: crece y encoge con la ventana) y la lista de ejercicios
tiene su propio scroll. En móvil las dos piezas se apilan y el conjunto se
desplaza, como antes. Medido a 1280×800: la modal pasa de 896×680 a 1152×704 y el
mapa de 120×320 a 176×468 (área ×2,1), sin scroll de página ni recorte; el músculo
más estrecho de la vista frontal mide 33×55 px, así que todos los del dibujo se
pulsan con holgura.

El **mapa muscular** del selector vive en `web/src/components/body-map/`: 89
regiones anatómicas entre las dos vistas (frontal y trasera), cada una con su
nombre en español y su grupo de la taxonomía (`hombro`, `pecho`, `core`,
`bíceps`, `antebrazo`, `espalda`, `tríceps`, `glúteo`, `pierna`, `gemelo`) o
marcada sin grupo, que es anatomía de relleno (cabeza, manos, pies,
articulaciones).

Los `path` no son nuestros: proceden de `body-muscles` (Ivan Vulović,
**Apache-2.0**) y se conservan tal cual; los `LICENSE` y `NOTICE` de esa licencia
viven junto a ellos, en la misma carpeta, y **hay que mantenerlos**. Lo que sí es
nuestro es el mapeo músculo→grupo, las etiquetas en español y los colores (los
tokens `--color-muscle` / `--color-muscle-strong` de `globals.css`, más
`--color-primary` para el grupo elegido); el fichero
`web/src/components/body-map/data.ts` es generado a partir del original y lo dice
en su cabecera.

## Taxonomía muscular: dos niveles

El músculo fino manda al filtrar; el grupo padre lo agrupa. Es lo que se usa en
el selector de ejercicios (mapa + fichas de grupo) y en el editor.

- **Nivel 1 — grupos (`exercise_tags`, 10).** Sin cambios: es lo que agrupa las
  listas (`GroupedExercises`), lo que se edita como «tag» y lo que usan las
  fichas de grupo del selector.
- **Nivel 2 — sub-regiones (`exercise_regions`, 35).** El músculo concreto del
  mapa, **sin lado** (izquierda y derecha son la misma sub-región) y sin
  anatomía de relleno. **Toda sub-región cuelga de un grupo que el ejercicio ya
  tiene como tag**: lo valida la API (400 `{field:'regions'}`) y lo comprueba el
  e2e, así que filtrar por el grupo padre siempre devuelve sus sub-regiones.
- El vocabulario son **dos espejos que un test ata**:
  `api/src/muscle-regions.ts` (lo que valida la API) y
  `web/src/components/body-map/regions.ts` (derivado del dibujo, con las
  etiquetas en español). `web/tests/muscle-regions.test.ts` falla si divergen.
  Dos regiones (`tibialis-anterior`, `lower-back-ql`) no las trabaja ningún
  ejercicio del catálogo: se dibujan y se filtran, y devuelven lista vacía.
- **El mapa se pulsa por músculo, no por grupo**: cada sub-región es **un solo
  `<g role="button">`** con sus dos mitades dentro, así que la rejilla de teclado
  tiene un botón por músculo (14 en la vista frontal, 21 en la trasera) en lugar
  de uno por grupo. El selector anuncia el músculo elegido («Músculo: …») y cada
  fila de ejercicio lleva sus músculos como **descripción**
  (`aria-describedby`, no pegados al nombre accesible). Las fichas de grupo van
  en un `role="group"` con la etiqueta «Grupo:».
- **El ratón no roba el foco al pulsar el dibujo** (`onMouseDown` cancela el
  evento): sin eso el navegador deja el foco en el `<g>` y pinta su anillo —un
  **recuadro redondeado** alrededor de las piezas del músculo— que tapa la señal
  de color («el músculo no aparece redondeado, cambia de color»). La selección se
  ve entonces solo por color (`--color-primary` sobre el verde en reposo
  `--color-muscle`), y el teclado conserva su anillo de foco (2 px
  `--color-primary`) al tabular y pulsar Enter o espacio.
- En el editor de ejercicios los músculos se eligen por grupo y solo aparecen los
  de los grupos ya elegidos como tag (el invariante de arriba): elegir un músculo
  añade su grupo si falta, quitar un grupo se lleva sus músculos, y guardar exige
  al menos uno.

## Despliegue: dos Workers (B')

| Worker | Config | Qué sirve | URL |
| --- | --- | --- | --- |
| `esencial` (frontal) | `wrangler.toml` (raíz), `main = web/worker/index.ts` | assets de `web/dist` + guard del HTML (302 → `/login`) | `https://esencial.nutrirutina.workers.dev` |
| `esencial-api` | `api/wrangler.toml` | las rutas `/api/*` (Hono), D1 y R2; sin assets | `https://esencial-api.nutrirutina.workers.dev` |

- El navegador llama a **los dos**: la SPA usa la URL absoluta de la API
  (`VITE_API_URL`, en `web/.env.production`; dev/e2e la sobreescriben) con
  `credentials: "include"`, y la API
  autoriza ese origen con CORS (`WEB_ORIGIN`). El frontal autoriza el origen de
  la API en su CSP (`API_ORIGIN`): los dos valores tienen que cuadrar.
- La cookie de sesión se emite desde la API, y en `workers.dev` lleva
  `Domain=<cuenta>.workers.dev` para que el Worker del frontal también la vea
  (fuera de `workers.dev` —dev/e2e en 127.0.0.1— se queda host-only; las cookies
  ignoran el puerto, así que en local se comparte igual).
- En dev/e2e esos dos orígenes se sobreescriben con `--var` (ver los scripts
  `dev:api` / `dev:web` y `e2e/playwright.config.ts`).
- Publicación: **un build de Workers Builds por Worker** (ver `DEPLOY.md` §6).

## Problemas conocidos

### 1. Migraciones locales — bootstrapeo (RESUELTO)

`api/migrations/0001_baseline.sql` ya no es un no-op: es el baseline (v1, espejo
histórico de `api/schema.sql`) y crea las tablas base. Así
`pnpm db:migrate:local` bootstrapea una base local vacía sin aplicar
`schema.sql` a mano.

- `api/schema.sql` es el **estado FINAL** del esquema (lo aplica el bootstrap de
tests junto a los deltas `0002`/`0003`/`0005`); `0001_baseline.sql` queda
congelado como v1 y NO se reescribe.
- Los deltas aditivos (`photo_path`, `section`, `recipe_tags`, `shopping_items`)
viven en `0002`+; los deltas de **reestructuración** (p. ej. `0009_fuerza_v2`
recrea `plan_sessions` con `plan_session_exercises` y `cardio_logs`) viven en
su propio número y NO se añaden al bootstrap de tests (schema.sql ya los
refleja).
- `0010_exercise_regions.sql` es **aditivo**: crea `exercise_regions` y siembra
las 237 sub-regiones de los 91 ejercicios. La tabla está en `schema.sql` y en la
lista `TABLES` del bootstrap de tests (`api/tests/helpers.ts`) — el resto del
sembrado no va al bootstrap, igual que `0004`/`0006`.
- `0011_exercise_regions_semilla.sql` es la **corrección de datos** de esa
siembra (una fila: el sóleo que faltaba en `Elevación de gemelos en prensa`).
`0010` se queda congelada como sembrado histórico; cualquier arreglo de datos
posterior va en su propio número. Los tests de la API **no** ven estas filas (su
bootstrap no siembra regiones), así que lo verifica el e2e.
- En remoto el baseline ya está aplicado en la D1 de producción; pero cada delta
nuevo hay que aplicarlo tras el deploy (`pnpm db:migrate:remote`; 0009 destruye
el histórico de planificación — ver `DEPLOY.md` §4).

### 2. wrangler pide confirmación y cuelga en no-TTY

`wrangler d1 migrations apply` muestra un prompt `(Y/n)` cuando corre en un
terminal interactivo (TTY) y se queda esperando si nadie responde.

**Solución:** invocarlo con stdin no-TTY (omite la confirmación y usa `yes`):

```bash
npx wrangler d1 migrations apply esencial --local < /dev/null
```

O ejecutar desde un entorno CI/script no-interactivo.

### 3. Embutir YouTube requiere que el Worker NO rompa el embed

Conflicto curioso: `api/src/middleware.ts` fija headers de seguridad en cada
respuesta, y dos de ellos rompen el iframe de YouTube si se vuelven a endurecer:

- `Content-Security-Policy` DEBE incluir `frame-src https://www.youtube.com`
(sin él, `default-src 'self'` bloquea el frame → el navegador no muestra el
vídeo).
- `Referrer-Policy` DEBE ser `strict-origin-when-cross-origin` (con
`same-origin` el iframe llega a YouTube sin `Referer`, y el player bloquea
con "This content is blocked. Contact the site owner to fix the issue.").

Ambos están rotos a la vez con las versiones más estrictas; con B' esas
cabeceras las pone el Worker del frontal y sus tests viven en
`web/tests/worker-guard.test.ts` (la API solo responde JSON).

### 4. `.dev.vars` en local — DOS ficheros (uno por Worker)

wrangler resuelve `.dev.vars` **junto al fichero de configuración**, no en el
cwd. Con dos Workers hacen falta dos copias del mismo contenido:

- `.dev.vars` (raíz, junto a `wrangler.toml`) — la usa el Worker del frontal.
- `api/.dev.vars` — la usa el Worker de la API (`api/wrangler.toml`).

Si falta la copia, ese Worker no ve `AUTH_SECRET`/`PASSWORD_HASH`: el login
responde **500** (`fail closed`) y todo lo protegido 401.

- Los dos son gitignored y los escribe el **mismo** script:
  `api/scripts/ensure-dev-vars.ts` (auto-generado por `pnpm dev` / `pnpm e2e`).
- La clave de desarrollo se lee de `**ESENCIAL_DEV_PASSWORD**`; si no está, se
  genera una aleatoria y se imprime al arrancar. Ninguna clave vive en git.
- Cómo fijarla: `ESENCIAL_DEV_PASSWORD='miclave' pnpm dev`.
- Ojo: la config de **tests** de la API vive en `api/tests/wrangler.test.toml`
  a propósito — si estuviera en `api/`, el `.dev.vars` de dev pisaría sus `[vars]`
  y los 202 tests fallarían (login con la clave de dev, cookie de test).

### 4b. Se arrancan DOS servidores en local

`pnpm dev` levanta los dos Workers (script `api/scripts/dev.ts`): frontal en
**8787** y API en **8789**; la SPA se construye contra `http://127.0.0.1:8789`.
Por separado: `pnpm dev:api` y `pnpm dev:web`. `pnpm deploy` publica los dos
Workers (primero el SPA con la URL de producción de la API).

La API lleva `--persist-to .wrangler/state` porque su config vive en `api/` y,
sin esa bandera, wrangler usaría `api/.wrangler/state` (base de dev nueva y
vacía). Igual en `pnpm db:migrate:local`: la base de desarrollo sigue siendo la
de siempre, `.wrangler/state` en la raíz.

El origen de dev es **`http://127.0.0.1:8787` y nada más**: el Worker del frontal
redirige `localhost:8787` a `127.0.0.1:8787` conservando ruta y query. El
navegador trata los dos nombres como sitios distintos y la cookie de sesión
(`SameSite=Lax`, emitida en `127.0.0.1`) no viaja de uno al otro, así que con
`localhost` el login parece ignorarse: la petición responde 200 y la app se
queda en `/login` sin error visible. Se arregla con un origen canónico en vez de
duplicar `WEB_ORIGIN` (CORS) y `API_ORIGIN` (CSP) para los dos nombres.

### 5. `pnpm deploy` no ejecuta el script de deploy

`pnpm deploy` es un comando **interno** de pnpm (despliegue de paquetes en un
monorepo) y tiene prioridad sobre el script del `package.json`, así que falla con
`ERR_PNPM_CANNOT_DEPLOY_MANY` en vez de construir y desplegar.

**Solución:** `pnpm run deploy` (equivale a `pnpm build && wrangler deploy`).

Ojo: cualquier push a `main` ya dispara Workers Builds, que construye y despliega
solo. El comando manual solo hace falta para publicar sin push, y deja una
versión más en el historial de Deployments de Cloudflare.

### 6. `pnpm e2e` reescribe `web/dist`, que es lo que sirve el frontal en dev

El `webServer` de Playwright construye el SPA con
`VITE_API_URL=http://127.0.0.1:8790` y escribe en el **mismo** `web/dist` que el
Worker del frontal sirve en dev (`[assets] directory = "./web/dist"`). Si dejas
`pnpm dev` levantado mientras corre la suite, el frontal de dev pasa a servir un
build que apunta a la API de e2e; al acabar la suite esa API ya no está, así que
**la app de dev se queda sin backend** aunque el servidor siga vivo.

**Solución:** vuelve a arrancar `pnpm dev` después de la suite: al arrancar
reconstruye `web/dist` con la URL buena (8789). Para saber a qué API apunta lo
que se está sirviendo:

```bash
node -e "const fs=require('fs');for(const f of fs.readdirSync('web/dist/assets').filter(f=>f.endsWith('.js')))console.log(f,[...new Set([...fs.readFileSync('web/dist/assets/'+f,'utf8').matchAll(/127\.0\.0\.1:(\d+)/g)].map(x=>x[1]))])"
```

Nota relacionada: `api/scripts/dev.ts` arranca y para los dos servidores juntos,
así que matar a mano cualquiera de los dos (por ejemplo el que ocupa 8787)
termina el `pnpm dev` entero con el código de salida del hijo.

### 7. Node ≥22.4 tapa el `localStorage` de jsdom

Desde Node 22.4 hay un `localStorage` nativo (experimental) en el global; sin
`--localstorage-file` no tiene métodos, y en jsdom `window === globalThis`, así
que `localStorage.clear()` / `setItem` fallan con `is not a function` y los tests
de web que lo usan (shell, tema) caen. El script `test` de `web/package.json`
corre vitest con `NODE_OPTIONS=--no-experimental-webstorage`. Ojo: esa bandera no
existe en Node < 22.4 (Node la rechaza en `NODE_OPTIONS` y no arranca); el repo
pide Node ≥ 24 en `engines`, así que no aplica aquí. Si lanzas `npx vitest` a mano,
pasa la misma variable.

## Tests e2e — base de datos propia

`pnpm e2e` **NUNCA** toca la base de desarrollo (`.wrangler/state`). El
`webServer` de Playwright arranca **sus dos servidores** con cadenas explícitas
(`e2e/playwright.config.ts`), con `reuseExistingServer: false` (así un
`pnpm dev` en marcha no se adopta):

1. API en **8790**: `ESENCIAL_DEV_PASSWORD=hola pnpm predev` → `rm -rf e2e/.state`
 → `wrangler d1 migrations apply esencial --local -c api/wrangler.toml
 --persist-to e2e/.state < /dev/null` → `wrangler dev -c api/wrangler.toml
 --port 8790 --var WEB_ORIGIN:http://127.0.0.1:8788 --persist-to e2e/.state`.
2. Frontal en **8788**: `pnpm predev` → `VITE_API_URL=http://127.0.0.1:8790 pnpm
 build` → `wrangler dev --port 8788 --var API_ORIGIN:http://127.0.0.1:8790
 --persist-to e2e/.state-web` (su propio dir de estado: el frontal no toca D1 y
 el `rm -rf e2e/.state` de la API no debe pisarle la caché).

Los `--var` son imprescindibles: sin ellos los Workers usarían los orígenes de
**producción** (los del `wrangler.toml`) y el navegador cruzaría a la API
equivocada (CORS/CSP fallan).

Lo que hay que respetar al escribir tests:

- **Añadir una migración no requiere tocar nada de `e2e/`.** La base se deriva
de `api/migrations/`. (Ojo: el bootstrap de tests de `api/` sí necesita la
tabla nueva en su lista `TABLES`, `api/tests/helpers.ts`.)
- **Nunca `POST` de un ejercicio que ya está en la semilla**: `exercises.name`
es UNIQUE y devuelve 400. El `id` se resuelve con `GET /api/exercises` y se
busca por nombre. Solo se crean por API recetas, plantillas y ejercicios de
cardio (los 91 sembrados son `kind='strength'`).
- `**workers: 1**`: hay un servidor y una base por corrida, así que el
paralelismo entre archivos es estado compartido, no aislamiento. No lo subas
sin dar a cada worker su propia base.
- **Fechas reales** (hoy, el lunes de la semana actual), no offsets por corrida.
- **La API es otro origen**: las peticiones directas de los tests usan
`apiUrl()`/`API_BASE` de `e2e/tests/helpers.ts` (y en el navegador, `fetch` con
`credentials: "include"`). Un `fetch("/api/...")` relativo iría al frontal.
- `pnpm e2e:check` corre la suite y verifica que los conteos de `.wrangler/state`
(filas D1 y objetos R2) no cambian. No navegues la app de dev mientras corre.

## Catálogo de ejercicios (seed)

`api/migrations/0004_seed_exercises.sql` siembra **91 ejercicios** / **145 tags**
con taxonomía general de grupo muscular: `pecho`, `espalda`, `hombro`, `bíceps`,
`tríceps`, `pierna`, `glúteo`, `core`, `antebrazo`, `gemelo`.
`technique_url` (vídeos de YouTube) y `steps` (arreglo JSON de pasos, columna
añadida en 0005) se ingestan por nombre en `0006_exercise_steps_data.sql`.
Todos los vídeos del catálogo son en **español** (auditado con yt-dlp en e8;
faltantes/reemplazos viven en `0007` y `0008`).
Los pasos solo faltan en ejercicios creados a mano — rellenarlos desde el
editor (textarea "Pasos de ejecución", un paso por línea).

Las **sub-regiones** de esos 91 ejercicios vienen en
`0010_exercise_regions.sql`: 237 filas, 33 de las 35 regiones del vocabulario
usadas, 0 ejercicios sembrados sin sub-región y 0 regiones que no cuelguen de un
grupo ya presente en sus tags (las dos sin uso son `tibialis-anterior` y
`lower-back-ql`). La auditoría de esos 91 ejercicios (2026-09-22, tres revisiones
independientes + comprobación SQL) dejó **una** corrección, en
`0011_exercise_regions_semilla.sql`: el sóleo de `Elevación de gemelos en prensa`
—238 filas en total—. El resto de candidatos eran discusiones de grado de
participación (cabeza larga del tríceps en los presses por encima de la cabeza,
isquios en el hip thrust, `traps-mid` en los encogimientos), no errores de
participación: no se tocan.

## Fotos de recetas (R2)

- Upload: `POST /api/uploads` (multipart `file`, png/jpeg/webp ≤ 5 MB) → `200 {photo_path}`
con key `recipe-<uuid>.<ext>`; servir `GET /api/uploads/:key` tras authGuard, `Cache-Control: immutable`.
- Binding R2 `PHOTOS` → bucket `**esencial-photos**` (`api/wrangler.toml` y `api/tests/wrangler.test.toml`);
`photo_path` se valida fail-closed (regex + `PHOTOS.head`) en `POST/PUT /api/recipes`.
- El render usa `photoSrc()` (`web/src/lib/api.ts`): la key pelada + prefijo
`/api/uploads/`, y delante la URL de la API (`VITE_API_URL`).
- e2e y login dev usan la password `hola` (`ESENCIAL_DEV_PASSWORD=hola pnpm dev`).

