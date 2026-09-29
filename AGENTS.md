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

**La fuente única es `web/src/globals.css`** (Material 3 Expressive; historia y
decisiones en `REDESIGN.md`). Tres capas, con un solo dueño cada una:

1. `:root` — valores crudos. El color M3 (32 roles, claro y oscuro) y los muelles
   viven en **`web/src/tokens.css`, generado** por `web/scripts/gen-tokens.ts` desde
   la semilla `#15803d` (`node web/scripts/gen-tokens.ts`); no se edita a mano,
   está fuera de biome y `tests/tokens.test.ts` falla si se desvía del generador.
   En `globals.css`: forma, espaciado, elevación, capa de estado y la fuente.
2. `@theme inline` — el puente a Tailwind (`text-title-m`, `bg-surface-container-high`,
   `rounded-xl`, `shadow-2`…). Vacía los espacios de nombres de Tailwind
   (`--color-*`, `--text-*`, `--radius-*`, `--shadow-*`: `initial`), así que
   `text-sm` o `rounded-lg` **no generan CSS**.
3. `@layer components` — la piel de las piezas (`.btn-*`, `.card-*`, `.input`,
   `.field`, `.chip`, `.fab`, `.connected`, `.checkbox`, `.switch`, `.badge-*`,
   `.alert-*`, `.dialog`, `.sheet`, `.menu`, `.toolbar`, `.snackbar`…).

Las pantallas consumen **las primitivas**:
- `web/src/components/ui.tsx`: `Button`, `SplitButton`, `ConnectedGroup` y
  `ConnectedItem`, `Fab`, `Chip`, `Card` (elevated, filled, outlined, tonal),
  `Field`, `Input`, `Textarea`, `Select`, `SearchBar`, `Checkbox`, `Switch`,
  `Badge`, `Alert`, `Kbd`.
- `expressive.tsx`: `Shape`, `Loader`, `WavyProgress`, `WavyRing`, `CountUp`,
  `RewardSeal`, `EmptyState`, `Monogram`.
- `overlay.tsx`: `Dialog`, `Sheet`, `OverlayHeader`, `useSnackbar`, `useTooltip`.

Los iconos son Material Symbols Rounded en línea (`icons.tsx`, generado por
`web/scripts/gen-icons.py`; `filled` para el destino activo).

La piel del punto 3 solo la escriben esos tres ficheros; una pantalla nunca. Sí se
aplican tal cual estas utilidades: `.section-label`, `.list-row`,
`.card-interactive`, `.skeleton`, `.state` (capa de estado M3 de cualquier
pulsable propio, junto con `onPointerDown={ripple}`), `.stagger` (entrada
escalonada; cada hijo con `--i`), `.type-move`, `.tabular` (cifras), `.text-e`
(variante *emphasized*) y `motion-*`.

**Al añadir algo nuevo:** reutiliza una primitiva. Si no encaja, añade primero el
token (`:root` + `@theme inline`) y después la primitiva. `pnpm lint` rechaza
(`web/scripts/check-design-tokens.ts`):
- un valor suelto (`rounded-[7px]`);
- la piel escrita a mano (`className="card"`);
- la escala cruda de Tailwind (`text-sm`, `rounded-lg`, `shadow-xl`,
  `bg-black/40`, `text-white`, `bg-red-500`, `duration-150`);
- la escala del sistema anterior (`text-caption`, `rounded-card`,
  `text-text-secondary`).

Se aceptan los derivados (`var()`, `calc()`, `env()`).

Escala vigente — todo lo demás sale de aquí:

| Familia | Tokens |
| --- | --- |
| Tipografía (roles M3) | `display-l` 57 · `display-m` 45 · `display-s` 36 · `headline-l` 32 · `headline-m` 28 · `headline-s` 24 · `title-l` 22 · `title-m` 16 · `title-s` 14 · `body-l` 16 · `body-m` 14 · `body-s` 12 · `label-l` 14 · `label-m` 12 · `label-s` 11; `+ text-e` = *emphasized* (peso 720, anchura 112 %, ROND 100) |
| Fuente | Google Sans Flex auto-alojada (`web/src/fonts/`, OFL), subset latino, ejes `wght` 400–800 · `wdth` 100–125 · `opsz` 12–60 · `ROND` 0–100 |
| Color | roles M3 (`primary`, `on-primary`, `primary-container`… `surface-container-lowest…highest`, `outline(-variant)`, `inverse-*`, `scrim`) + `accent*` = color de la sección |
| Espaciado | `stack` 12 · `gutter` 16 · `card` 20 · `section` 32 |
| Forma | `none` 0 · `xs` 4 · `s` 8 · `m` 12 · `l` 16 · `l-inc` 20 · `xl` 28 · `xl-inc` 32 · `xxl` 48 · `full`; `--radius-pill` 28 para lo que cambia de forma |
| Elevación | `shadow-1/2/3`, **solo** en el FAB, los menús, los tooltips, las hojas, la barra flotante y el snackbar; el resto, jerarquía por tono |
| Movimiento | muelles M3E: `motion-spatial-fast` (k 800, ζ 0,6) · `motion-spatial` (380, 0,8) · `motion-spatial-slow` (200, 0,8) rebotan (posición, tamaño, forma); `motion-effects-fast/-/-slow` (3800/1600/800, ζ 1) no rebotan (color, opacidad) |

- **Color por sección**: `[data-section="deporte|nutricion|hoy"]` reescribe
  `--accent*` (primary, tertiary, secondary); el Shell lo pone según la ruta.
  Úsalo (`bg-accent`, `text-on-accent-container`…) en lo que pertenece a la
  sección. `accent-soft` es su contenedor claro: el subitem activo del cajón y
  la piel tonal (`.btn-tonal`, `.btn-*[aria-pressed]`, `.chip` elegido,
  `.alert-info`). Es `secondary-container` en Deporte y Hoy, y `tertiary-soft`
  (tertiary tono 90/30, rol propio de `gen-tokens`, porque con fidelidad
  `tertiary-container` sale oscuro) en Nutrición; el color de receta lo
  reescribe también (`schemeVars`).
- **Tema** sistema/claro/oscuro: `web/public/theme.js` pone `data-theme` antes del
  primer pintado; `lib/theme.ts` lo cambia en vivo. Los dos comparten clave y
  regla, y `tests/theme.test.ts` los ata.
- **Campos**: estilo *outlined* en toda la app, con `Field` (etiqueta flotante;
  cada superficie declara `--field-bg` para el recorte).
- **Objetivos táctiles de 48 px**, salvo las filas de `SessionCell` y su Sí/No
  (44 px) y el quitar receta de una celda de comidas (40 px): la columna no da más.
- Un único anillo de foco para toda la app (`:focus-visible`), y el error de un
  campo se marca con `aria-invalid` — gancho de estilo y de lector de pantalla a
  la vez, sin estado duplicado en una clase aparte. El anillo, el borde y la
  etiqueta del campo enfocado y la selección de texto usan `--accent` (color de
  sección); `AA_PAIRS` exige primary, secondary y tertiary ≥ 4,5 sobre
  `surface` y `surface-container-high`.
- **Colores fijos a propósito** (no siguen la sección): la marca (logo del raíl,
  login), las insignias de estado (`Badge` `done` = primary, `pending` =
  tertiary: significan «hecho»/«pendiente» en cualquier pantalla), la tarjeta de
  fuerza registrada y el sello de recompensa (verde de Deporte también en Hoy),
  la paleta de comandos y el catálogo `/ui`.
- **Un estado de la piel nunca se pelea con una utilidad**: la capa `utilities`
  de Tailwind gana a `@layer components`, así que un `bg-*`/`text-*` en la
  pieza tapa su regla de `aria-pressed`. Así estuvo roto el grupo conectado
  (la elegida no se pintaba en `--accent`): su reposo vive ahora en
  `:where(.connected) > *`, sin especificidad para que un `.btn` dentro
  (SplitButton) conserve su piel. Lo cubre `nav.spec.ts`.
- Todo lo animado se neutraliza con `prefers-reduced-motion`: las transiciones
  quedan a 1 ms, el morph salta directo, lo que entra lo hace con un fundido de
  150 ms, y los giros, la onda y las View Transitions se apagan.
- Fotos de receta: **todo** `<img>` de una foto lleva
  `crossOrigin="use-credentials"`. El color dinámico lee la foto en un canvas, y
  si otra copia de la foto se pidió sin CORS, la caché sirve esa y la lectura
  falla.
- Catálogo de variantes en la ruta **`/ui`** (en el menú, junto a «Cerrar
  sesión»): míralo antes de inventar una pieza.
- `wireframes/DESIGN.md` y `docs/architecture/diseno.html` siguen con el sistema
  anterior; donde discrepen de `globals.css`, manda `globals.css`.

### Pantallas de calendario (fuerza y comidas)

`/plan-fuerza` y `/plan-recetas` van sin cabecera: el calendario es el
protagonista y ocupa la altura de la ventana en escritorio (sin scroll de
página), con un hueco vacío reservado abajo para acciones futuras. Las dos rutas
están en `CALENDAR_ROUTES` (`web/src/components/shell.tsx`): añadir una ahí le da
el mismo trato (sin título, alto completo, hueco inferior).

**El menú lateral solo lo pliega el usuario** (botón «Ocultar menú», recordado en
`localStorage` `esencial.sidebar`): navegar nunca lo cambia. Antes las rutas de
calendario lo plegaban solas y al pulsar Deporte o Nutrición en el cajón este se
cerraba bajo el cursor (bug; lo cubren `shell.test.tsx` y `nav.spec.ts`).

En esas rutas, **plegado, el raíl M3E es su versión compacta de 80 px**
(`w-20`): iconos con el nombre en `aria-label`/`title`, menú FAB, búsqueda y tema,
sin desplegables de sección. El catálogo y «Cerrar sesión» ceden su sitio, y siguen
disponibles en la búsqueda y al desplegar el menú. Fuera del calendario el raíl
colapsado mide 96 px (con etiquetas) y el expandido 288 px. El submenú de la sección
va como **grupo de botones conectados sobre el calendario**, en escritorio y en móvil.
El `main` de estas rutas es `max-w-calendar` —el token `--container-calendar`,
110rem = 1760 px— con `lg:px-6` en vez de `max-w-6xl` + `lg:px-8`. Medido a
1280×800 con el raíl plegado: columna de día **153,14 px**, sin scroll de página ni
horizontal (los e2e de `calendar-layout.spec.ts` miden con la preferencia plegada).
Techo del ancho: a 1280 no cabe más de ~153 px por columna con el raíl; con el cajón
de 288 px abierto la columna encoge. Con títulos largos (>20 caracteres)
el `truncate` de las celdas sigue recortando (decisión explícita de no tocar las
celdas). Móvil y tablet no cambian: el raíl solo existe desde `lg`.

En todas las rutas el raíl es `lg:sticky lg:top-0 lg:h-dvh`: mide la ventana, no
la página. Sin eso, en la fila `lg:flex-row` se estira al alto del `main` y en
una página larga (`/ejercicios`) empuja la búsqueda y el tema hasta el final (lo
cubre `nav.spec.ts`).

Ese `lg:overflow-y-auto` del raíl implica también `overflow-x`, así que cualquier
desplegable `absolute` dentro de él se recorta a sus 80–96 px. El menú del FAB va
por eso `fixed`, anclado al FAB al abrirse, y el raíl lleva `lg:z-10`: `sticky`
abre su propio contexto de apilamiento y, sin z-index, el `main` pinta encima.

Las dos pantallas comparten la **rejilla semanal** (`web/src/components/week-grid.tsx`):
un único contenedor con la navegación de semana y las siete columnas, con la
columna de «hoy» marcada. El componente no sabe nada del dominio: cada página
inyecta el contenido de sus días por el render prop (`children`), que es lo
único que difiere (sesiones en fuerza, tomas en comidas).

La rejilla lleva su `view-transition-name` **solo mientras cambia la semana** (lo
pone y lo quita `WeekGrid.shift`, al acabar la transición). Puesto siempre,
cualquier otra transición de la página —abrir el editor del día— la convierte en
una capa propia, y el navegador la pinta **por encima** del velo y del modal: el
calendario se colaba sobre el modal mientras este crecía (y la rejilla deslizaba
sin cambiar de semana). Lo cubren `tests/view-transition.test.tsx` y el e2e de
`strength.spec.ts`.

En la columna de un día de fuerza (`SessionCell`, `web/src/routes/plan-fuerza.tsx`)
los ejercicios **se reparten la altura de la columna** en vez de quedarse
apiñados arriba: la lista (`<ol>`) se queda con el espacio libre y cada fila
(`flex-1`, `min-h-11`) es un bloque `bg-surface-container-high rounded-m` con el
nombre en `text-body-m` —hasta dos líneas (`line-clamp-2`), así que cabe el nombre
entero de casi todo el catálogo— y el objetivo (`targetSummary`, «4 series») debajo
en `text-body-s`. **No lleva `.stagger`**: dnd-kit mide las filas al empezar a
arrastrar, y una fila a mitad de su animación de entrada está desplazada. Con muchas filas el mínimo manda y el desborde sigue quedando
dentro del calendario (lo cubre `calendar-layout.spec.ts`).

Cada fila lleva su propia **✕ para desprogramar ese ejercicio** sin abrir el
modal: la fila se convierte en su confirmación en línea (nombre truncado +
**Sí/No**, con el nombre completo en el `aria-label`) y, al confirmar, el día se
guarda con el mismo PUT de los items que usa el arrastre (`usePlanWeek.saveItems`,
optimista y con recarga). Después aparece un snackbar con **Deshacer**, que vuelve
a guardar los items de antes. Los dos botones van en **una sola línea** a propósito:
la columna mide ~153 px y dos botones de texto largo se salían de la fila y
quedaban tapados por el día siguiente — de ahí las etiquetas cortas y los 44 px
(excepción táctil documentada). Quitar el **último** ejercicio deja el
día sin items, que no es representable (la API exige ≥1): desprograma la sesión
(DELETE) y el día vuelve a su «+ añadir», igual que con la ✕ de la sesión. Su
Deshacer la **recrea** con POST (misma fecha, nombre e items). Solo sirve para las
planificadas: una registrada no tiene ✕, porque recrearla perdería su registro.

En la celda de una comida (`SlotCell`, `web/src/routes/plan-recetas.tsx`) el
nombre va recortado a dos líneas; al dejar el cursor **500 ms** encima (o al
enfocarla con el teclado) sale un **tooltip** con la foto (o el `Monogram`) y el
nombre completo. Se cierra al salir, al perder el foco, con Escape (pila de
capas) o al desplazar. Es `useTooltip` (`overlay.tsx`): devuelve los manejadores
del disparador y el tooltip, que se pinta `fixed` —el `overflow-y-auto` de la
rejilla lo recortaría— y **como hermano** del enlace, no dentro: dentro, su texto
entraría en el nombre accesible del enlace. Lo cubren `meal-plan.test.tsx` y
`e2e/tests/meal-tooltip.spec.ts`.

### Editor de recetas (crear y editar)

`app.tsx` registra **`/recetario/nueva`** y **`/recetario/:id/editar`** con la
misma página (`RecetaEditorPage`, `web/src/routes/receta-editor.tsx`): al entrar,
la lista o la ficha se desmontan y no quedan detrás. Antes editar abría la modal
`recipe-editor` sobre la ficha; ahora el lápiz de `/recetario/:id` es un `Link`
sin transición (editar no anima, solo crear). Las dos rutas funcionan al recargar
(deep-link); Cancelar, Escape (pila de capas) o «atrás» no llaman a la API, y
Guardar manda un único POST (crear) o PUT (editar) para volver a `/recetario` o a
la ficha, que al ser otro montaje del hook relee la receta. Salir del editor
(Cancelar, Escape o Guardar) navega con **`replace: true`**, así que su URL no se
apila: «atrás» desde la ficha no reabre el borrador que se acaba de cerrar (el
editor de plantillas sí lo apila).

La piel es la suya (nació aquí): cabecera de sección (`bg-accent-container`) con
Cancelar y Guardar, y cinco tarjetas en columnas desde `lg` —foto, nombre con
categorías, ingredientes, materiales y pasos (`components/steps-editor.tsx`)—.
**Descripción y comensales solo aparecen al editar**: al crear salen `null` (E8) y
el PUT reemplaza el registro entero, así que el borrador de edición
(`fromRecipe`) arrastra la receta hidratada completa. La subida de foto es la
misma que al crear: `POST /api/uploads` y, si falló y quedó pendiente, reintento
al guardar. La **unidad** del ingrediente es texto libre en la API (`z.string()`),
así que el desplegable (`UNITS`) añade una `<option>` propia para una unidad que
no sea `gr/ml/ud` («g», «pechuga»): si no, una receta existente se vería como «—».
Lo cubren `web/tests/recetario-editor.test.tsx` y el e2e de `recipes.spec.ts`.

### Editor de plantillas (crear y editar)

`app.tsx` registra **`/plantillas`**, **`/plantillas/nueva`** y
**`/plantillas/:id/editar`** como rutas propias: al abrir el editor la lista se
desmonta y no queda detrás (ya no hay modal). Las dos rutas del editor funcionan
al recargar (deep-link); «atrás», Escape o Cancelar vuelven a `/plantillas` sin
llamadas a la API. Escape va por la pila de capas (`lib/escape-stack.ts`), que
ignora el Escape con el que dnd-kit cancela un arrastre de teclado, así que la
página no se abandona a media operación.

La piel es la de «Nueva receta»: cabecera de sección (`bg-accent-container`) con
Cancelar y Guardar, y dos tarjetas en columnas desde `lg` — el nombre y el
borrador (ejercicios ordenables por asa, `web/src/components/sortable.tsx`,
ratón, táctil y teclado) en una, y el selector **embebido** (búsqueda, mapa
muscular y grupos plegables) en la otra. Guardar manda un solo POST (crear) o
PUT (editar) con las posiciones 0..n-1 y vuelve a la lista con el id en el
`state` de la navegación, así que la tarjeta guardada llega desplegada.

El mapa del selector va en un recuadro dentro de su tarjeta, a alto fijo
(`h-96`, `w-auto`: su alto manda en el tamaño de los músculos), y debajo siguen
la búsqueda, el conmutador de vista, las fichas de grupo y la lista, que crece
sin scroll propio: la página se desplaza como cualquier otra. Medido a
1280×800: el dibujo frontal mide 145×384 px y la caja más pequeña de un músculo
es la del hombro anterior (62×11); en la modal el dibujo medía 176×468.

**Crear sigue un único patrón** (recetas, plantillas, ejercicios y el menú FAB):
lo pulsado **crece hasta lo que abre** (transformación de contenedor con View
Transitions). El FAB es el único elevado; el botón de cabecera es un `Button`
*filled* de tamaño por defecto, sin sombra. El mecanismo vive en
`lib/view-transition.ts`: el `onClick` llama a `morphFrom(e.currentTarget)` antes
de navegar (o de abrir, con `runViewTransition` + `flushSync`, como «Nuevo
ejercicio», que no tiene ruta), y el destino pone `style={useCreateMorph()}`.
Así el nombre `create` está solo en lo pulsado en la foto «antes» y solo en el
destino en la foto «después» (dos iguales anulan la transición). Carga directa
y editar no animan. El destino apaga su animación de entrada propia (la hace la
transición). Los tests usan `tests/view-transition-stub.ts`.

El **día → modal** del calendario de fuerza (`day-sheet`) recibe el mismo trato
en `globals.css`: el contenido llena el contenedor que crece y la columna de
origen se despide en `--duration-effects-fast`. Sin eso la columna (alta y
estrecha) se quedaba **estirada encima del modal** todo lo que dura la expansión.
Mientras se carga el detalle de la sesión (`GET /api/plan-sessions/:id`, antes
de abrir), el `Loader` va **superpuesto** a la rejilla (`absolute inset-0`), no
debajo en la columna: en el flujo le quitaba ~112 px de alto y la rejilla volvía
a crecer justo mientras la modal se expandía (lo cubre `strength.spec.ts`).

El **menú FAB** sigue el M3E: velo (`Scrim`) que tapa la página y la cierra al
pulsarlo, y acciones planas sin sombra, cada una con el `accent-container` de la
sección a la que lleva (`data-section={sectionOf(to)}`: Sesión y Plantilla en
verde de Deporte, Receta en el de Nutrición).

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
- El editor de ejercicios (crear y editar) tiene **la piel de «Nueva receta»**:
  página propia que sustituye a la lista o al detalle, cabecera de sección con
  Cancelar/Guardar y tarjetas en dos columnas desde `lg` (dibujo de los músculos
  elegidos, nombre + tipo en botones conectados + los diez grupos como fichas,
  músculos por grupo, preparación y técnica, pasos). Los pasos numerados son
  `web/src/components/steps-editor.tsx`, compartido con la receta.

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

Los dos puertos se cambian por entorno para correr la suite junto a otros
worktrees: `E2E_WEB_PORT=8863 E2E_API_PORT=8864 pnpm e2e` (por defecto 8788 y
8790). La config deriva de ahí las URLs, los `--var` y `VITE_API_URL`, y
`e2e/tests/helpers.ts` (`API_BASE`) lee el mismo `E2E_API_PORT`.

Si un test arrastra o pulsa justo después de abrir un diálogo, espera antes a que
acaben las animaciones (`settle` en `strength.spec.ts`): mientras dura la
transición de vista día → modal, su capa se queda con el puntero.

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

