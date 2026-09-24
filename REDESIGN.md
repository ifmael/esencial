# Rediseño B — Cristal / aurora

Referentes: visionOS, Arc, Raycast. Superficies de vidrio translúcido sobre una
aurora de gradientes que se mueve muy despacio. Tema claro por defecto y tema
oscuro con conmutador.

## Qué cambió

**Tokens (`web/src/globals.css`)**
- Color: marca `#0d6e3e`, lienzo `#eef3f1` y tres colores de aurora (menta, cielo,
  lavanda). Tokens nuevos: `surface-strong`, `scrim`, `photo-scrim`/`on-photo`,
  `error-soft`/`on-error` y los bordes de luz `glass-edge*`. Todos los colores
  tienen su valor oscuro en `:root[data-theme="dark"]`. `primary-container` se
  eliminó: nadie lo usa ya.
- Tipografía: Manrope variable **auto-alojada** (`/fonts/manrope-latin.woff2`,
  subset latino, `font-display: swap`, licencia OFL al lado). `display` pasa de
  24 a 28 px, y `title`/`display` llevan tracking negativo.
- Radios `control` 12 · `panel` 14 · `card` 20, y `sheet` 28 (nuevo).
- Vidrio: `blur-glass` 18px, `blur-chrome` 28px. Sombras con tinte verde
  oscuro, más `shadow-sheet` y `shadow-glow`.
- Movimiento: `ease-spring` = muelle amortiguado (ζ 0,7, ω 16, rebasa un 4,6 %)
  muestreado en `linear()`, sobre 500 ms. Se usa solo en `transform`.

**Primitivas (`web/src/components/ui.tsx`)**: `Card`/`cardClass` ahora son de
vidrio. Nuevas: `Sheet`/`sheetClass`, `Scrim`, `chromeClass`, `chipClass` y
`Button variant="danger"`. El guardarraíl del lint vigila también esta piel
nueva.

**Pantallas**: las 11 rutas quedan sin clases crudas de tamaño, radio u overlay:
- `text-sm/xs/lg/xl/2xl` → escala de texto; `rounded-lg/md/xl/full` → radios
  del sistema.
- Las 4 modales pasan a `Scrim` + `Sheet`, y la lista de la compra a
  `sheetClass`.
- `bg-error` → `danger`; `from-black/60 text-white` → `photo-scrim`/`on-photo`.
- Las fichas de categoría se conmutan con `aria-pressed`. El test que fijaba la
  clase `bg-primary-container` ahora comprueba `aria-pressed`, que es lo que
  percibe el usuario.

**Lógica nueva (TDD, `web/src/lib/ambient.ts` + `tests/ambient.test.ts`)**:
- Tema: la elección guardada manda; sin elección, el del sistema.
- Pausa de la aurora con la pestaña oculta (`data-hidden`).
- Inclinación 3D de `.card-interactive`, hasta 5°. Solo se activa con
  `hover: hover`, `pointer: fine` y sin reduced-motion.

## Pieza estrella

La **aurora + vidrio con muelle**. Para verla:
1. Abre `/` o `/ui` → bloque «Movimiento».
2. Pasa el ratón por una tarjeta de Hoy: se inclina hacia el puntero y, al
   pulsarla, se hunde con un muelle.
3. Pulsa **Tema oscuro** (menú lateral o barra inferior) para ver la aurora de
   noche.

La aurora es una sola capa `body::before` de gradientes radiales. Se anima con
`@property`, con un ciclo de 40 s. No lleva filtro de blur.

## Rendimiento (`backdrop-filter`)

**Presupuesto de blur**:
- Una tarjeta dentro de otra tarjeta, o dentro de una hoja, no vuelve a
  desenfocar.
- `/plan-fuerza` tiene **3 nodos con blur** a la vez: el cromo, la rejilla y la
  fila de chips.
- Con la modal abierta, la hoja sustituye a la rejilla como capa con blur.

Medido en Chromium headless con **CPU 4×** (`Emulation.setCPUThrottlingRate`),
tiempos entre fotogramas medidos con rAF:

| Escenario | Viewport | p50 | p95 | máx | >50 ms | long tasks |
| --- | --- | --- | --- | --- | --- | --- |
| Reposo (aurora en marcha) | 390×844 | 16,7 | 17,6 | 17,7 | 0 | 0 |
| Scroll | 390×844 | 16,6 | 17,6 | 17,7 | 0 | 0 |
| Abrir/cerrar modal | 390×844 | 16,7 | 17,5 | 25,0 | 0 | 0 |
| Scroll | 1280×800 | 16,7 | 17,4 | 17,7 | 0 | 0 |
| Scroll, vidrio opaco | 390×844 | 16,7 | 17,6 | 17,7 | 0 | 0 |

Límite de la medida: el throttling solo frena la CPU. El coste real de
`backdrop-filter` está en la GPU, y un Mac no reproduce la de un móvil modesto.
Hay que confirmarlo en un Android de gama baja.

Fallbacks:
- `@supports not (backdrop-filter)` y `prefers-reduced-transparency: reduce` →
  vidrio opaco y sin blur.
- `prefers-reduced-motion` → aurora quieta, sin inclinación ni animaciones.

**Contraste AA**, calculado en el peor caso: la aurora más intensa detrás y sin
el promediado del blur.
- Claro: texto 14,9:1 · secundario 6,1:1 · primario ≥5,3:1 · error 5,4:1.
- Oscuro: ≥13:1 · ≥7:1 · ≥8,8:1 · ≥5,5:1.

## Peso añadido

| | Antes | Después |
| --- | --- | --- |
| CSS | 39,41 kB (8,26 gz) | 44,39 kB (9,61 gz) → **+1,35 kB gz** |
| JS | 421,83 kB (127,09 gz) | 425,69 kB (127,06 gz) → **≈ 0** |
| Fuente | — | 24,8 kB woff2 (solo latino, se carga con swap) |

No hay dependencias nuevas en runtime. La CSP no cambia: la fuente sale del
mismo origen.

## Verificación

- `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde (API 210, web 263).
- Capturas revisadas a 1280×800 y 390×844 (el script registra `innerWidth ×
  innerHeight` junto a cada captura) de: login, `/`, recetario, detalle, nueva,
  plan-recetas, plan-fuerza (claro, oscuro y con la modal abierta), plantillas,
  ejercicios, detalle de ejercicio, sesión y `/ui`.
- Calendario a 1280×800: `scrollHeight` 800 y `scrollWidth` 1280, sin scroll.

## Lo que quedó fuera

- Medición en un dispositivo real de gama baja: solo hay throttling de CPU.
- Evitar el destello del tema oscuro antes de que cargue el JS: haría falta un
  script en línea en `index.html`, y la CSP no permite scripts en línea.
- Las fichas de tags de `ejercicios.tsx` y los botones del mapa muscular se
  mantienen como estaban, a propósito: no se tocan el mapa ni sus LICENSE/NOTICE.
- Las View Transitions entre rutas no se hicieron.
