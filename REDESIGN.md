# Rediseño G — Material 3 Expressive

Referentes: **Material 3 Expressive** (Google, 2025): Pixel/Android 16 y la app de
Fitbit. Lo que se tomó: color tonal que sale de una semilla, formas abstractas que
cambian, muelles en vez de curvas, tipografía variable que se mueve y superficies
jerarquizadas por tono. Lo que no: componentes de terceros (Material Web está en
mantenimiento y no implementa Expressive). Todo está hecho aquí, sobre los tokens
y el lint del repo.

## Cómo verlo

1. `ESENCIAL_DEV_PASSWORD=hola pnpm predev`, `pnpm db:migrate:local`.
2. API: `npx wrangler dev -c api/wrangler.toml --port 8862 --persist-to .wrangler/state --var WEB_ORIGIN:http://127.0.0.1:8861`.
3. Web: `VITE_API_URL=http://127.0.0.1:8862 pnpm build && npx wrangler dev --port 8861 --var API_ORIGIN:http://127.0.0.1:8862`.
4. Abre `http://127.0.0.1:8861` con la clave `hola`. `/ui` enseña todas las piezas.

## Piezas estrella y cómo verlas

| Pieza | Dónde | Qué mirar |
|---|---|---|
| Morph de forma | cualquier botón; `/ui` § Forma | al pulsar el botón pasa de 28 a 12 px con el muelle espacial rápido (baja a 10,9 y vuelve a 12). La forma grande de `/ui` se transforma en la que pulses. El grupo conectado cambia de forma la pieza elegida. |
| Muelles | `/ui` § Movimiento, «Mover» | seis bolas, una por muelle: las espaciales rebotan y las de efectos no |
| Transformación de contenedor | `/recetario` → una receta; FAB → «Receta»; clic en un día de `/plan-fuerza` | la tarjeta crece hasta la cabecera; el FAB se convierte en el formulario; el día se abre en el diálogo |
| Eje compartido | `/plan-fuerza`, `/plan-recetas`: ‹ › | la semana sale hacia un lado y la nueva entra por el otro, siguiendo el sentido del cambio |
| Progreso ondulado | `/` (anillo «Pasos del día»), `/sesion/:fecha`, `/plan-fuerza` (barra de la semana) | la onda avanza con cada serie o sesión |
| Sello de recompensa | `/sesion/<hoy>`: marca todas las series | un sol de 12 lóbulos entra con muelle lento y la cifra de series cuenta hacia arriba. Desmarcar una serie lo retira. |
| Snackbar con Deshacer | `/plan-fuerza` (✕ de un ejercicio o de una sesión), lista de la compra (quitar un artículo manual) | «Deshacer» restaura con el mismo PUT, o recrea la sesión con POST |
| Búsqueda ⌘K | ⌘K / Ctrl+K, «Buscar…» del raíl, barra de búsqueda arriba en móvil | *search view* M3 con grupos (recetas, ejercicios, plantillas, pantallas, acciones). A pantalla completa en móvil. |
| Color dinámico por receta | `/recetario/1` (calabaza), `/2`, `/3` | la cabecera y los contenedores se tiñen con el color de la foto |
| Tema sin destello | conmutador en el raíl, la barra móvil o la búsqueda | con el JS bloqueado la página ya sale en su tema (medido: `data-theme=dark`, fondo `#101510`, `#root` vacío) |

## Decisiones ya tomadas por el usuario (§1), cómo quedaron

1. **Roles tipográficos M3**: `display-l/m/s`, `headline-l/m/s`, `title-l/m/s`,
   `body-l/m/s` y `label-l/m/s` con su interlineado, peso y tracking; `text-e` da la
   variante *emphasized* (peso 720, anchura 112 %, `ROND` 100). Están migradas todas
   las pantallas, `check-design-tokens.ts`, `/ui` y `AGENTS.md`.
2. **View Transitions con router de datos**: `createBrowserRouter` + `RouterProvider`
   (como A), `<Link viewTransition>` y `runViewTransition` con el techo de 400 ms
   para el cambio de semana (`busy`).
3. **Recompensa**: sello en forma de sol con muelle espacial lento y `CountUp`, sin
   confeti.
4. **⌘K**: *search view* M3.

## Qué cambió

### Tokens (`web/src/globals.css` + `web/src/tokens.css`)

- **Color**: 32 roles M3 (primary/secondary/tertiary/error con sus
  on/container, `surface-dim/bright`, `surface-container-lowest…highest`,
  `on-surface(-variant)`, `outline(-variant)`, `inverse-*`, `scrim`) en claro y
  oscuro. Se generan **una vez** desde `#15803d` con
  `@material/material-color-utilities` (`scripts/gen-tokens.ts`) y se congelan en
  `tokens.css`, generado y fuera del formateador. `tests/tokens.test.ts` falla si
  el fichero se desvía del generador. Paletas: primary = la semilla (fidelidad),
  secondary = verde azulado (h 175, Hoy), tertiary = ámbar (h 55, Nutrición),
  neutros con un toque de verde.
- **Color por sección**: `[data-section]` reescribe `--accent*`: Deporte = primary,
  Nutrición = tertiary, Hoy = secondary. Lo fija el Shell según la ruta; lo toman
  el raíl, los chips, el FAB, el botón `filled` y los destacados.
- **Forma**: `none 0 · xs 4 · s 8 · m 12 · l 16 · l-inc 20 · xl 28 · xl-inc 32 · xxl 48
  · full`, más `--radius-pill` (28 px) para lo que cambia de forma (ver «Desvíos»).
- **Muelles** (`src/lib/spring.ts`): los seis del esquema *expressive*, resueltos
  analíticamente (masa 1, ω = √k) y muestreados en `linear()` de 41 puntos, con
  duración = tiempo en asentarse a menos del 0,1 %.

  | Muelle | k | ζ | ω (rad/s) | Uso |
  |---|---|---|---|---|
  | spatial-fast | 800 | 0,6 | 28,3 | pulsar, morph, chips |
  | spatial-default | 380 | 0,8 | 19,5 | diálogos, hojas, entradas |
  | spatial-slow | 200 | 0,8 | 14,1 | sello, progreso |
  | effects-fast | 3800 | 1 | 61,6 | capa de estado |
  | effects-default | 1600 | 1 | 40 | color, opacidad |
  | effects-slow | 800 | 1 | 28,3 | onda (ripple) |

  En utilidades: `motion-spatial(-fast|-slow)` y `motion-effects(-fast|-slow)`, que
  emparejan easing y duración.
- **Elevación**: `shadow-1/2/3`, solo en el FAB, los menús, las hojas, la barra
  flotante y el snackbar. Todo lo demás se jerarquiza por tono.
- **Capa de estado M3** (`.state`): velo de `currentColor` al 8 % en hover, 10 % en
  foco y 10 % al pulsar, más la onda (`ripple()`) solo con puntero.

### Tipografía

**Google Sans Flex** (OFL, `web/src/fonts/OFL-google-sans-flex.txt`), auto-alojada
desde el mismo origen (la CSP no cambia), subset latino (ASCII, Latin-1, comillas,
guiones, €, →) y `font-display: swap`. Conserva los **cuatro** ejes que pide el
brief, recortados a lo que usa la app: `wght` 400–800, `wdth` 100–125, `opsz` 12–60
y `ROND` 0–100.

| Recorte | woff2 |
|---|---|
| Google Fonts, latin, ejes completos | 472 KB |
| Google, `wdth,wght,ROND@100..125,400..800,100` (sin opsz, ROND fijo) | 78 KB |
| Instanciado sin `opsz` (fontTools) | 73 KB |
| **Elegido**: 4 ejes (instanciado con fontTools, `scripts` en el historial) | **169 KB** |

Precio: 96 KB más que la opción mínima, a cambio de tamaño óptico real en los
titulares grandes y `ROND` animable (ver «Fuera» para el recorte posible).
Tipografía que se mueve: la etiqueta activa del raíl y de la barra pasa de 500 a
800 (`.type-move`), y el botón pulsado gana peso. Cifras con `tabular`.

### Primitivas (`components/ui.tsx`, `expressive.tsx`, `overlay.tsx`)

- `Button`: `filled`, `tonal`, `outlined`, `text`, `danger` en `sm 40 · md 48 ·
  lg 56 · icon 48 · icon-sm 40`. Pasa de redondo a cuadrado al pulsar, tiene capa de
  estado y onda.
- `SplitButton` (con su propio menú, Escape y toque fuera), `ConnectedGroup`/`ConnectedItem`
  (el elegido cambia de forma y el pulsado crece mientras sus vecinos ceden), `Fab`
  (sm/md/lg, se transforma con `aria-expanded`), `Chip`.
- `Card`: `elevated`, `filled`, `outlined` y `tonal`, más esquinas asimétricas en
  las destacadas (`rounded-xl rounded-tr-xxl`).
- Campos: estilo **outlined** en toda la app (sobre superficies tonales, uno relleno
  se funde con la tarjeta). `Field` pone la etiqueta flotante, el texto de ayuda y el
  error con `aria-invalid` + `aria-describedby`; cada superficie declara su
  `--field-bg` para que el recorte de la etiqueta tape el borde. `Checkbox` con área
  de 48 px, `Switch` cuyo pulgar crece al pulsar, `SearchBar`.
- `Alert`, `Badge` (`pending`, `done`, `neutral`, `accent`), `Kbd`.
- `Shape` (11 formas M3E en `lib/shapes.ts`, todas muestreadas con los mismos 120
  puntos, de modo que cambiar `name` interpola el `d`), `Loader` (forma que gira y se
  transforma), `WavyProgress`, `WavyRing`, `CountUp`, `RewardSeal`, `EmptyState`
  (composición de formas), `Monogram` (miniatura con forma estable por nombre).
- `Dialog` (móvil: a pantalla completa, como hoja o centrado), `Sheet` (asa y
  arrastre para cerrar, lógica en `lib/sheet.ts`; panel lateral desde `md`),
  `OverlayHeader`, `SnackbarHost`/`useSnackbar` (estado en `lib/snackbar.ts`).
- Iconos: Material Symbols **Rounded** en línea (40, generados con
  `scripts/gen-icons.py`), con `filled` para el destino activo.

### Navegación

- Escritorio: **raíl M3E**, con el menú FAB arriba (Sesión de hoy · Plantilla ·
  Receta, cada una en su color) y el indicador activo en pastilla (se ensancha de 32
  a 56 px). Fuera del calendario mide 96 px y se expande a un cajón de 288 px con
  submenús. En las rutas de calendario el raíl colapsado mide **80 px**.
- Móvil: barra de navegación M3 de 80 px con área segura, barra de búsqueda arriba
  y FAB flotante.
- Submenú en las rutas de calendario: grupo de botones conectados.

### Pantallas

- **Hoy**: cabecera *hero* (fecha en `display` *emphasized*, esquina asimétrica,
  forma de fondo), anillo ondulado «Pasos del día» (`dayProgress`: 3 comidas + la
  sesión), carrusel multi-browse con *scroll-snap* de las comidas, FUERZA en verde
  deporte y NOTAS con `Field`.
- **Recetario**: rejilla con una tarjeta *hero* de 2×2, miniaturas `Monogram` sin
  foto, `SearchBar`, `stagger`. El detalle tiene cabecera de foto con `rounded-b-xxl`,
  título `display-s` *emphasized* sobre un velo y el color dinámico.
- **Plan fuerza**: barra ondulada de sesiones de la semana, racha de semanas
  (`weekStreak` de D), «hoy» dentro de una galleta de 9 lados, Deshacer, diálogo del
  día con botón dividido «Guardar / Guardar y registrar». En móvil el diálogo es una
  hoja inferior.
- **Sesión**: anillo de series, marca de fila que pasa de galleta a sol al
  completarla, esfuerzo con formas que ganan lóbulos, barra de herramientas flotante
  («Marcar todas las series de X», contador, «Cerrar sesión») y sello.
- **Plantillas**: diálogo M3 (a pantalla completa en móvil, un solo `role=dialog`,
  mismo alto fijo) con barra flotante (contador, Cancelar, Guardar), selector con
  `SearchBar`, chips de grupo y vista frontal/trasera como grupo conectado.
- **Plan recetas**: tomas con miniatura, lista de la compra en hoja inferior con
  quitar + Deshacer (`manualSet`), selector de receta en diálogo.
- **Ejercicios**: filtro por grupo con chips, cabecera *hero* del detalle, pasos
  numerados sobre formas, editor con `Field`.
- **Nueva receta**: una columna en móvil, botón dividido «Guardar receta / Guardar y
  añadir otra».
- **Login**: formas grandes de fondo, marca `display-s` *emphasized* y tarjeta
  `rounded-xl`.

### Color dinámico por receta

`lib/recipe-color.ts` carga `color-scheme.ts` y la utilidad de color con
`import()` **solo en `/recetario/:id` con foto** (chunk aparte de 16,6 KB gz). La foto
se lee en un canvas de 64×64 (`crossOrigin="use-credentials"`: la API ya manda CORS
con credenciales), `seedFromPixels` cuantiza y puntúa, y `recipeScheme` genera
claro y oscuro con `SchemeFidelity` y comprueba AA en las 19 parejas. Si algo falla,
manda el esquema de sección: sin foto, foto gris o lavada (Score no da semilla; nunca
el azul de reserva de Google), un error de carga o no pasa AA. Medido: calabaza →
`#974800` (claro) y `#ffb688` (oscuro); lentejas → `#5f3017`; ensalada → `#006e1a`;
tostadas (gris) → sección; tortilla (sin foto) → sección.

### Contraste AA (medido; todas las parejas ≥ 4,5)

La lista completa está en la cabecera de `tokens.css`. Mínimos: claro 4,53
(on-secondary-container / secondary-container) y oscuro 4,54. Texto principal:
16,32 (claro) y 14,31 (oscuro).

## Desvíos del brief, con su porqué

- **`@material/material-color-utilities` 0.3.0, no 0.4.0.** La 0.4.0 publica
  `color_spec_2025.js` con un import sin `.js`, que Node ESM no resuelve, así que el
  generador de tokens (que corre con `node`) fallaba. La 0.3.0 da los mismos
  esquemas (`DynamicScheme`, `SchemeFidelity`, `MaterialDynamicColors`) con los que
  se generan los tokens. Cuando se arregle, subir y regenerar.
- **Radio de las piezas que cambian de forma: 28 px, no `full` (9999 px).** Medido:
  con 9999 px el muelle interpola 9999 → 12 y pasa por 9061, 2635 y **0** antes de
  asentarse, así que se veía como un salto a cuadrado. Con 28 px la curva es 28 → 19,6
  → 13,6 → 10,9 → 12: se ve redondear y cuadrar, con un rebote leve. En controles de
  hasta 56 px de alto, 28 px sigue siendo una píldora.
- **Tokens de color en `[data-theme]`, no con `light-dark()`.** El tema lo fija
  siempre `theme.js` (también con «sistema»), así que un selector basta y el
  resultado se lee en el CSS generado.
- **Objetivos táctiles**: 48 px en toda la app, **salvo** las filas de ejercicio de
  `SessionCell` y su confirmación Sí/No en línea (44 px, `h-11`: la columna mide
  ~153 px), los botones de quitar receta de una celda de `/plan-recetas` (40 px,
  misma razón) y los chips, que se ven de 32 px pero se pulsan en 48 (`::after`).

## Peso (build de producción; antes = `main`)

| | Antes | Después |
|---|---|---|
| JS principal | 421,8 kB (127,1 gz) | 568,7 kB (168,1 gz) |
| JS perezoso (color dinámico) | — | 53,9 kB (16,6 gz), solo en `/recetario/:id` con foto |
| CSS | 39,4 kB (8,3 gz) | 63,2 kB (12,3 gz) |
| Fuentes | — (sistema) | 168,8 kB woff2 |

Dependencia nueva: `@material/material-color-utilities` 0.3.0 (Apache-2.0). Solo
viaja en el chunk perezoso; los tokens estáticos se calculan en build. Del aumento de
JS, unos 29 kB en crudo son los paths de los iconos y el resto las primitivas nuevas
(formas, overlays, búsqueda).

## Verificación

- `pnpm lint` (biome sin errores + lint de tokens en 48 ficheros), `pnpm typecheck`
  y `pnpm test` en verde: API 210, web 372. Tests nuevos: muelles, color (AA, caída
  por gris y por AA), formas, tema + `theme.js`, tokens generados, snackbar, hoja,
  ranking y UI de la búsqueda (tipo `action`, `role=group`, «Sin resultados» en una
  región viva), shell (tema, FAB, color de sección), primitivas (Field, SplitButton),
  catálogo, racha y recreación de sesión, deshacer, `manualSet`, `dayProgress`,
  sello, «Guardar y añadir otra» y «Guardar y registrar».
- `pnpm e2e` con `E2E_WEB_PORT=8863 E2E_API_PORT=8864`: ver el resultado al final.
- **48 capturas** (12 rutas × 1280×800 y 390×844 × claro y oscuro), revisadas en hojas
  de contactos. En cada una se comprobó por programa: sin desborde horizontal,
  `data-theme` aplicado, y `/plan-fuerza` y `/plan-recetas` sin scroll de página a
  1280.
- Piezas estrella demostradas en Chromium con datos reales de dev:
  - FAB → menú (el FAB pasa a círculo y salen tres acciones).
  - ⌘K «cala» → Enter lleva a `/recetario/1`.
  - Marcar 9/9 series → sello; desmarcar una → se retira.
  - ✕ de «Press banca» → snackbar → Deshacer → los ejercicios del día vuelven a 3
    (comprobado en la API).
  - Color dinámico en cinco recetas (valores arriba).
  - Tema con el bundle bloqueado.
  - Morph medido en el tiempo.
- `prefers-reduced-motion: reduce` (con `matchMedia` confirmado a `true`):
  - Transiciones a 1 ms.
  - El morph salta directo a 12 px, sin curva.
  - Sello, diálogos y hojas entran con un fundido de 150 ms.
  - Sin giro del sello ni del cargador, sin deriva de la onda, sin View Transitions.

## Fuera

- Fuente: con `opsz` fijo a 24 se bajaría a ~73 KB; hoy se paga el tamaño óptico
  real. Si pesa más de lo que aporta, basta con cambiar `opsz` a `None` en el
  instanciado.
- El JS principal pasa de 500 kB sin comprimir (aviso de Vite): no hay división por
  rutas (`lazy()`), que sería el siguiente paso.
- `docs/architecture/diseno.html` y `wireframes/DESIGN.md` siguen con el sistema
  anterior (manda `globals.css`).
- La hoja inferior se cierra arrastrando el asa, no desde cualquier punto del
  contenido (así no compite con el scroll de la lista).
