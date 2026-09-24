# Rediseño A — Editorial cálido

Referentes: Kinfolk, NYT Cooking, Headspace. Papel crema con grano, tinta cálida,
oliva de marca, terracota de acento; Fraunces para titulares, Source Sans 3 para
leer. Movimiento sereno, sin rebotes.

## Pieza estrella: View Transitions nativas (sin dependencia; coste real: el router de datos, ~18 kB gz)

- **Receta → detalle**: la portada y el título de la tarjeta se transforman en la
  cabecera del detalle. Cómo verla: `/recetario` → pulsa una tarjeta; «←» vuelve.
- **Cambio de semana**: la rejilla se desliza con un fundido en el sentido de la
  flecha, en `/plan-fuerza` y `/plan-recetas`.
- Comprobado en Chromium 150 (headless, 1280×800): `::view-transition-group(recipe-cover)`
  y `(recipe-title)` interpolan (a mitad de vuelo: tarjeta 307 px → 884 px →
  cabecera 960 px, 480 ms). `week-grid` usa `week-out-left`/`week-in-right` y los
  inversos al retroceder. Con `prefers-reduced-motion: reduce` no se llama a
  `startViewTransition` y las animaciones duran 0,01 ms.
- Sin la API (Firefox antiguo, jsdom), la navegación es directa.
- Cambios que hizo falta: `app.tsx` pasa a **router de datos**
  (`createBrowserRouter` + `RouterProvider`), porque `<BrowserRouter>` ignora
  `viewTransition`. Los nombres de la transición los pone `flushSync` solo en la
  tarjeta pulsada, y la receta viaja en `location.state` para pintar la cabecera
  en el primer fotograma. `WeekGrid` espera a la prop `busy` para no animar hacia
  datos viejos, con un techo de 400 ms (test con temporizadores falsos): con la
  API lenta o caída anima hacia «Cargando…»/el aviso en vez de congelar el
  pintado.
- Alternativa sin ese coste: dejar `<BrowserRouter>` y envolver `navigate` a mano
  en `startViewTransition` + `flushSync` (≈0 kB, más código propio).

## Tokens y primitivas

- **Color**: paleta papel/tinta/oliva. Nuevos: `accent`/`accent-soft`
  (terracota), `scrim`/`scrim-strong`, `error-soft`. Contraste AA comprobado
  (el más justo: `text-secondary` sobre `surface-muted`, 4,78).
- **Tipografía**: 7 pasos (`hero` 44 nuevo; `body` 15→16, `display` 24→32).
  `h1`–`h3` en Fraunces (opsz auto, SOFT 50).
- **Ritmo**: `gutter` 20 · `card` 24 · `section` 40. **Radios**: 6/8/12.
  **Movimiento**: 140/220/420 + `page` 480 ms, `--stagger` 60 ms.
- **Primitivas**: `Button variant="danger"`, `Chip` (`aria-pressed`),
  `Badge tone="accent"`. **Utilidades**: `.stagger`, `.caption-editorial`,
  `.rule-accent`.
- **Guardarraíl**: `pnpm lint` rechaza ahora también la escala cruda de Tailwind
  (`text-sm`, `rounded-lg`, `shadow-xl`, `text-white`, `bg-black/40`…). Las 138
  apariciones se migraron a tokens (`bg-scrim`, `text-caption`, `rounded-panel`,
  `variant="danger"`…).

## Pantallas

- `/recetario` como revista: rejilla asimétrica, donde la primera receta con foto
  abre a doble ancho; antetítulos en terracota y entrada escalonada.
- `/recetario/:id`: portada 21:9, título `hero`, entradilla en cursiva,
  ingredientes con tachado al marcarlos y pasos con numeral terracota.
- Calendarios: cabeceras de día en serif con la fecha y «Hoy» en terracota.
- Arreglos de paso: botones de icono de 30 px a 44 px (nueva receta), cabeceras
  de grupo de 16 px a 44 px, desborde horizontal en `/recetario/nueva` (móvil).
- Fuera del diseño: `vite.config.ts` apaga el `localStorage` nativo de Node 25,
  que tapaba el de jsdom (9 tests de `shell` ya fallaban en `main`).

## Peso (`web/dist/assets`, antes → después)

| | antes | después |
| --- | --- | --- |
| JS | 421,8 kB (127,1 gz) | 484,0 kB (146,4 gz): ~18 kB gz son el router de datos; View Transitions, 0 |
| CSS | 39,4 kB (8,3 gz) | 48,0 kB (10,2 gz) |
| Fuentes | — | woff2 auto-alojadas; en español solo se bajan `fraunces-latin` 121 kB y `source-sans-3-latin` 29 kB (el resto de subsets van por `unicode-range`) |

La CSP no cambia: no hay orígenes externos.

## Fuera de alcance

- `.caption-editorial` usa una cursiva sintética (no se importa `full-italic`, +~120 kB).
- Semana con red lenta: solo cubierta por el test de 400 ms, no medida en el navegador.
- `dist` copia también los subsets no latinos de Fontsource (~413 kB en total); el
  navegador solo baja los latinos (~150 kB). Un `@font-face` propio los quitaría.
- Fraunces con los ejes `full` (121 kB): con el subset `soft` (62 kB) se
  perdería el óptico. Se puede recortar con un subset propio si pesa.
- Sin transición compartida en «atrás» desde el detalle a una tarjeta concreta
  (vuelve con el fundido de página).
- `wireframes/DESIGN.md` y `docs/architecture/diseno.html` no se tocaron: manda
  `globals.css`.
- Sin e2e (puertos compartidos entre worktrees): verificado con lint,
  typecheck, tests unitarios y el navegador.
