# Rediseño B — Cristal / aurora

Referentes: visionOS, Arc, Raycast. Superficies de vidrio sobre una aurora de
gradientes que se mueve muy despacio. Tema claro por defecto y tema oscuro con
conmutador (menú lateral o barra inferior). El tema se aplica antes del primer
pintado.

## Qué cambió

**Tokens (`web/src/globals.css`)**
- Color: marca `#0d6e3e`, lienzo `#eef3f1`, tres colores de aurora (menta,
  cielo, lavanda) y tres tintes de vidrio (`surface` 0,68, `surface-strong`
  0,82, `surface-sheet` 0,94). Tokens nuevos: `scrim`, `photo-scrim`/`on-photo`,
  `error-soft`/`on-error` y los bordes de luz `glass-edge*`. Todos tienen su
  valor en `:root[data-theme="dark"]`. `primary-container` se eliminó.
- Tipografía: Manrope variable **auto-alojada** (`/fonts/manrope-latin.woff2`,
  solo el subset latino, `font-display: swap`, con preload y la licencia OFL al
  lado). `display` pasa de 24 a 28 px.
- Radios `control` 12 · `panel` 14 · `card` 20, y `sheet` 28 (nuevo).
- Vidrio: `blur-glass` 18 px y `blur-chrome` 28 px. Sombras con tinte verde,
  más `shadow-sheet` y `shadow-glow`.
- Movimiento: `ease-spring` = muelle amortiguado (ζ 0,7, ω 16, rebasa un 4,6 %)
  muestreado en `linear()` con 17 puntos. Se asienta en 0,999 → 1, sin salto al
  final.

**Primitivas (`web/src/components/ui.tsx`)**
- Tarjetas: `Card`/`cardClass` = vidrio tintado, **sin blur**.
  `blurCardClass` = con blur, solo para la rejilla del calendario.
- Nuevas: `Sheet`/`sheetClass`, `Scrim`, `chromeClass`, `chipClass` y
  `Button variant="danger"`.
- El guardarraíl del lint cubre toda la piel nueva.

**Pantallas**: las 11 rutas quedan sin clases crudas de tamaño, radio u overlay.
- Las 4 modales pasan a `Scrim` + `Sheet`, y la lista de la compra a
  `sheetClass` con área segura.
- `bg-error` → `danger`; `from-black/60 text-white` → `photo-scrim`/`on-photo`.
- Las fichas de categoría se conmutan con `aria-pressed`. El test que fijaba la
  clase `bg-primary-container` ahora comprueba `aria-pressed`.
- El scrim funde el color de fondo, no la opacidad. Un scrim con opacity < 1
  sería raíz de backdrop y la hoja desenfocaría solo el scrim.

**Lógica nueva (TDD)**
- `web/src/lib/ambient.ts`: tema (la elección guardada manda; sin ella, el del
  sistema), pausa de la aurora con la pestaña oculta (`data-hidden`) e
  inclinación 3D de `.card-interactive`, hasta 5°. La inclinación solo se
  activa con `hover: hover`, `pointer: fine` y sin reduced-motion.
- `web/public/theme.js`: script clásico en `<head>`, permitido por
  `default-src 'self'`. Pone `data-theme` antes de pintar.
  `tests/ambient.test.ts` lo ejecuta y exige que use la misma clave y la misma
  regla que `ambient.ts`: al cambiar la clave, el test falla.
- Comprobado en el navegador: con el bundle de la app bloqueado, la página sale
  ya en oscuro.

**Arreglos de paso**
- `vitest` en Node 25: el `localStorage` nativo de Node tapaba el de jsdom
  (9 tests de `shell.test.tsx` ya fallaban antes). Se desactiva con
  `execArgv: ["--no-experimental-webstorage"]`.
- `/recetario/nueva` desbordaba a 390 px (425 de ancho real) desde antes del
  rediseño. Causa: la pista implícita del grid mide `auto`, no `minmax(0,1fr)`.
  Se arregla con `grid-cols-1`, más `min-width: 0` en `.input`.

## Pieza estrella

La **aurora + vidrio con muelle**. Para verla:
1. Abre `/` o `/ui` → bloque «Movimiento».
2. Pasa el ratón por una tarjeta de Hoy: se inclina hacia el puntero y, al
   pulsarla, se hunde con un muelle.
3. En `/plan-fuerza`, abre un día: la hoja entra con muelle sobre la rejilla
   desenfocada.
4. Pulsa **Tema oscuro** para ver la aurora de noche.

La aurora es una sola capa `body::before` de gradientes radiales, sin filtro de
blur. Se anima con `@property`, con un ciclo de 40 s.

## Rendimiento (`backdrop-filter`)

**Regla**: el blur es opt-in.
- Llevan blur el cromo (barra lateral y barra inferior), las hojas (modales y
  lista de la compra) y **una** pieza protagonista, la rejilla del calendario
  (`blurCardClass`).
- Las tarjetas de lista no llevan blur, solo tinte, borde de luz y sombra:
  sobre una aurora ya difusa, el blur apenas se ve.
- Una tarjeta dentro de otra, o de una hoja, es un pozo sin blur.

Nodos con `backdrop-filter` activo, en Chromium con `prefers-reduced-transparency:
no-preference` emulado:

| Ruta | Antes del opt-in | Ahora |
| --- | --- | --- |
| `/ejercicios` (91 tarjetas) | **93** | **2** |
| `/recetario`, `/plantillas`, `/`, detalles | 2 + n.º de tarjetas | 2 |
| `/plan-fuerza`, `/plan-recetas` | 3 | 3 |
| Modal de sesión o lista de la compra abierta (390×844) | — | 4 |
| `/login` | — | 0 |

Tiempos entre fotogramas (rAF), con **CPU 4×** (`Emulation.setCPUThrottlingRate`):

| Escenario | Viewport | Nodos con blur | p50 | p95 | máx | >50 ms |
| --- | --- | --- | --- | --- | --- | --- |
| `/ejercicios` scroll, antes del opt-in | 390×844 | 93 | 16,6 | 17,5 | 17,7 | 0 |
| `/ejercicios` scroll | 390×844 | 2 | 16,6 | 17,4 | 17,6 | 0 |
| `/ejercicios` scroll | 1280×800 | 2 | 16,7 | 17,5 | 17,6 | 0 |
| `/plan-fuerza` reposo (aurora en marcha) | 390×844 | 3 | 16,6 | 17,6 | 17,7 | 0 |
| `/plan-fuerza` scroll | 390×844 | 3 | 16,6 | 17,6 | 17,7 | 0 |
| `/plan-fuerza` abrir/cerrar modal | 390×844 | 3→4 | 16,7 | 17,5 | 33,3 | 0 |

**Límite de la medida**: el throttling solo frena el hilo principal. El coste de
`backdrop-filter` se paga en raster y composición (GPU), que rAF no ve y que un
Mac no reproduce: incluso con 93 capas el número sale igual. **El coste en GPU
no se midió**; queda pendiente de un Android de gama baja o de una traza con
categorías `cc,gpu,viz`. Por eso el opt-in no se decidió por estos números,
sino para acotar el peor caso (de 93 capas a 4).

**Fallbacks**
- `@supports not (backdrop-filter)` y `prefers-reduced-transparency: reduce` →
  vidrio opaco y sin blur. Comprobado: 0 nodos con blur y el mismo scroll.
- `prefers-reduced-motion` → aurora quieta, sin inclinación ni animaciones.

**Contraste AA**, calculado sin blur (el peor caso de una tarjeta, que ya no
desenfoca): el tinte de la superficie sobre la aurora cruda, incluidas las tres
manchas apiladas en su punto más intenso. Mínimos:

| | texto | secundario | primario | error |
| --- | --- | --- | --- | --- |
| Tarjeta clara (0,68) | 13,98 | 5,71 | 4,97 | 5,08 |
| Tarjeta oscura (0,66) | 12,53 | 6,64 | 8,34 | 5,25 |
| Hoja clara (0,94) | 16,56 | 6,76 | 5,89 | 6,02 |
| Hoja oscura (0,94) | 15,42 | 8,18 | 10,26 | 6,47 |

## Peso añadido (gzip según Vite)

| | Antes | Después |
| --- | --- | --- |
| CSS (`assets/`) | 39,41 kB (8,26 gz) | 44,67 kB (9,69 gz) → **+1,43 kB gz** |
| JS (`assets/`) | 421,83 kB (127,09 gz) | 425,84 kB (128,24 gz) → **+1,15 kB gz** |
| Fuente (`fonts/`, fuera de `assets/`) | — | **+24,8 kB** woff2, solo latino |
| `theme.js` (raíz) | — | **+0,5 kB gz** |

No hay dependencias nuevas en runtime. La CSP no cambia: la fuente y
`theme.js` salen del mismo origen.

## Verificación

- `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde (API 210, web 265).
- **Capturas retomadas con el vidrio activo**. Las primeras se hicieron con
  `prefers-reduced-transparency: reduce` (vidrio opaco), así que no cuentan.
  Cada captura registra viewport, `rt=false`, tema, nodos con blur y si hay
  scroll horizontal:
  - las 12 rutas a 1280×800 y a 390×844 (login, `/`, recetario, detalle, nueva,
    plan-recetas, plan-fuerza, plantillas, ejercicios, detalle de ejercicio,
    sesión, `/ui`), en claro;
  - `/`, plan-fuerza y detalle de receta en oscuro, en las dos medidas, más
    ejercicios en escritorio;
  - a 390×844: la modal de sesión abierta y la lista de la compra abierta (el
    padding inferior respeta el área segura).
- Ninguna ruta tiene scroll horizontal. Calendario a 1280×800: `scrollHeight`
  800 y `scrollWidth` 1280.

## Lo que quedó fuera

- Coste en GPU en un dispositivo real de gama baja (ver arriba).
- Fotos de receta: no hay ninguna en los datos de prueba, así que el
  `photo-scrim` se comprobó solo con el hueco «Sin foto».
- View Transitions entre rutas.
- Las fichas de tags de `ejercicios.tsx` y los botones del mapa muscular se
  mantienen como estaban, a propósito: no se tocan el mapa ni sus
  LICENSE/NOTICE.
