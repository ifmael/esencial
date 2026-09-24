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

## Verificado

- `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde (API 210, web 275; hay
  tests nuevos para ranking de la paleta, tema, UI de la paleta y catálogo).
- 1280×800: `/plan-fuerza` y `/plan-recetas` sin scroll (`scrollHeight` 800,
  `scrollWidth` 1280), columna de día de **154 px** (antes 152,84), y la
  confirmación Sí/No cabe en la fila. Las 12 rutas, sin desbordamiento
  horizontal a 1280 ni a 390.
- Contraste AA en todos los pares de texto, en los dos temas (el mínimo es
  5,13:1).
- El ratón no roba el foco en el mapa muscular; el teclado conserva el anillo de
  2px en `--color-primary`. Siguen 14 `<g role=button>` en la vista frontal.
- Con `prefers-reduced-motion: reduce`, `.reveal` queda en `animation: none`.

## Peso

| | Antes | Después |
|---|---|---|
| CSS | 39,41 kB (8,26 gz) | 44,33 kB (9,37 gz) |
| JS | 421,83 kB (127,09 gz) | 432,07 kB (130,20 gz) |
| Fuentes | — | 52,5 kB woff2 (Geist 29,4 + Mono 23,1) |

Sin dependencias de JS nuevas: la paleta son unos 3 kB gz.

## Fuera

- Objetivos de menos de 44px que ya existían: accesos rápidos de `/` («Plan
  recetas», «Ir a hoy»), ✕ de ingredientes y pasos en `/recetario/nueva`.
- `docs/architecture/diseno.html` y `wireframes/DESIGN.md` siguen con la escala
  anterior (manda `globals.css`).
- Paleta: sin historial de recientes y sin buscar plantillas por nombre.
- El tema elegido se aplica al cargar el JS; sin script en línea en
  `index.html`, así que con tema forzado distinto del sistema puede verse un
  destello del tema del sistema.
