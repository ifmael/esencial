# Rediseño E — Minimal preciso

Referentes: Linear, Vercel, Resend. Grises neutros con un matiz verde apenas
perceptible, **un solo acento** (`--color-primary`, que solo rellena el botón
primario y marca activo y foco), bordes de 1px nítidos, densidad alta.

## Cómo verlo

1. `ESENCIAL_DEV_PASSWORD=hola pnpm predev`, luego la API y la web en 8842/8841
   (comandos en el brief), y abre `http://127.0.0.1:8841` con la clave `hola`.
2. **Pieza estrella**: pulsa **⌘K / Ctrl+K** (o «Buscar…» en el menú, o la
   lupa de la barra inferior en móvil). Escribe `calab`, `press` o `semana`;
   ↑↓ para moverte, ↵ para abrir, Esc para cerrar.
3. Tema: botón «Tema: sistema/claro/oscuro» del menú, o «Cambiar tema» en la
   paleta. `/ui` enseña todas las variantes.

## Qué cambió

- **Tokens** (`web/src/globals.css`): cada color es un `light-dark()`, así que
  claro y oscuro salen del mismo token; `color-scheme` sigue al sistema y
  `data-theme` en `<html>` lo fija. Tokens nuevos: `on-error`, `error-soft`,
  `scrim`, `photo-fade`, `on-photo`, `halo`, `edge-hi`, `font-mono`. Borrados:
  `primary-container`, `secondary` (sin uso tras la migración).
- **Escala**: texto 11/13/**14/15/18/26**, radios **6/8/12**, relleno de tarjeta
  16, sombras casi nulas, movimiento 120/160/240 ms. Titulares con tracking
  negativo.
- **Tipografía**: Geist y Geist Mono auto-alojadas (`@fontsource-variable`),
  solo subset latino y `font-display: swap`, servidas desde el mismo origen, así
  que la CSP no cambia.
- **Primitivas** (`ui.tsx`): `Button variant="danger"`, `Card featured` (filo
  con degradado), `Chip` (`aria-pressed`, se ve de 32px y se pulsa en 44px),
  `Kbd`, `Alert`, `chipClass`. Utilidades: `.scrim`, `.reveal`.
- **Detalle**: halo que sigue al puntero en las tarjetas (un listener pasivo,
  solo con `pointer: fine`); tarjetas de recetas y ejercicios que entran con el
  scroll (`animation-timeline: view()` con `@supports`; se apaga con movimiento
  reducido).
- **Pantallas migradas**: `text-sm/xs/lg/xl/2xl/3xl`, `rounded(-lg/md/xl/full)`,
  `shadow-sm/xl`, `bg-black/40`, `from-black/60`, `text-white`,
  `bg-primary-container`, `bg-error` → tokens y primitivas. Los filtros (vista,
  grupo, músculos) pasan de botones primarios a `Chip`.
- **Arreglos por el camino**: `/recetario/nueva` desbordaba 18px en horizontal a
  390px (el fallo ya estaba antes); `pnpm test` fallaba en Node 25 porque su
  `localStorage` nativo tapaba el de jsdom (ahora el script lleva
  `--no-experimental-webstorage`).
- **Arreglos tras la revisión**:
  - Paleta: el foco se devuelve una sola vez al cerrar y la referencia se
    suelta. Antes quedaba viva y se capturaba dentro del updater de `setOpen`,
    que StrictMode ejecuta dos veces. Hay test: navegar tras cerrar no roba el
    foco (comprobado que falla si el foco se devuelve en cada render).
  - Mapa muscular: el `transition-colors` de cada músculo también animaba
    `outline-color`, así que al tabular el anillo se fundía durante 150 ms desde
    el color del texto. Ahora la transición solo anima relleno y trazo
    (`transition-[fill,stroke]`) y el anillo es `--color-primary` desde el primer
    fotograma, medido en claro (#157a45) y oscuro (#3ecf8e) a 0 y 200 ms.
  - `Alert` admite otro `role`: la muestra estática de `/ui` usa `note` y el
    lector de pantalla ya no la anuncia en cada visita.

## Verificado

- `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde (API 210, web 279; hay
  tests nuevos para ranking de la paleta, tema, UI y foco de la paleta, `Alert`
  y catálogo).
- 1280×800: `/plan-fuerza` y `/plan-recetas` sin scroll (`scrollHeight` 800,
  `scrollWidth` 1280), columna de día de **154 px** (antes 152,84), y la
  confirmación Sí/No cabe en la fila. Las 12 rutas, sin desbordamiento
  horizontal a 1280 ni a 390.
- Contraste AA en todos los pares de texto, en los dos temas (el mínimo es
  5,13:1).
- El ratón no roba el foco en el mapa muscular. Con teclado, el anillo mide 2px
  y es `rgb(21,122,69)` = `--color-primary`, medido justo después de cada Tab
  en tres músculos. Siguen 14 `<g role=button>` en la vista frontal.
- Chips: se ven de 32px y se pulsan en 44px (comprobado con `elementFromPoint`
  a 5,5px por encima y por debajo). Confirmación Sí/No de la ✕: 44px de alto.
- Geist y Geist Mono cargan desde el mismo origen, sin errores de consola ni de
  CSP.
- Con `prefers-reduced-motion: reduce`, `.reveal` queda en `animation: none`.

## Peso

| | Antes | Después |
|---|---|---|
| CSS | 39,41 kB (8,26 gz) | 44,45 kB (9,39 gz) |
| JS | 421,83 kB (127,09 gz) | 432,15 kB (130,23 gz) |
| Fuentes | — | 52,5 kB woff2 (Geist 29,4 + Mono 23,1) |

Sin dependencias de JS nuevas: la paleta son unos 3 kB gz.

## Fuera

- Objetivos de menos de 44px que ya existían: accesos rápidos de `/` («Plan
  recetas», «Ir a hoy»), ✕ de ingredientes y pasos en `/recetario/nueva`.
- `docs/architecture/diseno.html` y `wireframes/DESIGN.md` siguen con la escala
  anterior (manda `globals.css`).
- Paleta (mejoras posibles, no hechas): «Cambiar tema» es un comando con
  `href` especial (`#tema`) en vez de un tipo `action`; las cabeceras de grupo
  no son `role="group"` (el lector no oye «Recetas»/«Ejercicios»); la región
  «Sin resultados» nace ya llena y algunos lectores no la anuncian. Tampoco
  hay historial de recientes ni búsqueda de plantillas.
- Filas de chips que se parten en dos líneas: el área táctil de 44px sobresale
  7px arriba y abajo, y con `gap-1` (4px) entre filas las áreas se solapan hasta
  ~10px (el chip de abajo gana el toque). Peor caso: el filtro de grupo en
  `/plantillas/nueva` y los músculos del editor de ejercicios. Arreglo: separar
  las filas con `gap-y-3.5`.
- El tema elegido se aplica al cargar el JS; sin script en línea en
  `index.html`, así que con tema forzado distinto del sistema puede verse un
  destello del tema del sistema. Se arreglaría con un `/theme.js` externo en
  `web/public/` (mismo origen: la CSP no cambia).
- El lockfile entró en un commit posterior al que añade las fuentes: los
  commits intermedios no pasan `pnpm install --frozen-lockfile` (HEAD sí).

## Revisión visual

Las 13 rutas, a 1280×800 y 390×844, en claro y oscuro (52 capturas; viewport,
ruta y `data-theme` comprobados en cada una, sin desbordamiento horizontal):

| Ruta | Resultado |
|---|---|
| `/login` | sin defectos |
| `/` | sin defectos |
| `/recetario` | sin defectos |
| `/recetario/1` | sin defectos (sin foto, el título queda al pie del recuadro, sin solaparse) |
| `/recetario/nueva` | sin defectos |
| `/plan-recetas` | sin defectos; a 1280 los nombres de receta se recortan en la celda (decisión previa de no tocar las celdas) |
| `/plan-fuerza` | sin defectos; mismo recorte de nombres a 1280 |
| `/plantillas` | sin defectos |
| `/plantillas/nueva` | sin defectos (modal y mapa muscular en los dos temas) |
| `/ejercicios` | sin defectos |
| `/ejercicios/6` | sin defectos |
| `/sesion/2026-09-24` | sin defectos |
| `/ui` | sin defectos |
