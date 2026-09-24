# Rediseño D — Neo-brutalista lúdico

Referentes: Duolingo, Gumroad, Figma Config. Tinta gruesa, sombras duras
desplazadas (sin blur), colores planos saturados, radios medianos y rebote al
pulsar. Fondo crema `#fff6e0`, tinta `#111`.

## Qué cambió

**Tokens (`web/src/globals.css`)**
- Color: `ink`, `primary` (verde de texto, AA) + `primary-fill` (verde potente de
  rellenos, siempre con tinta encima), acentos `accent-yellow/pink/blue`,
  `on-error`, `scrim` (velo de modales). Todos los pares texto/fondo ≥ 4.5:1.
- Trazo: `border` a secas = 2px de tinta; `border-thick` 3px.
- Sombras duras: `shadow-control` 3px · `card` 4px · `raised` 6px · `press` 1px.
- Tipografía: Bricolage Grotesque (variable, subset latino, auto-alojada, `swap`)
  para `h1/h2/title/display/hero`; `display` sube a 28px; nuevo `hero` 48px.
- Movimiento: nuevo `ease-bounce`; animaciones `pop` (casilla) y `stamp` (sello).
- Foco: tinta de 3px + halo verde, visible sobre crema, blanco y color.

**Primitivas y piel**
- `.btn`: sombra dura que se reduce y el botón se traslada al pulsar (se «hunde»);
  nueva variante `danger` (`<Button variant="danger">`).
- `.card`: borde de 3px + sombra dura; `.card-interactive` se levanta y se hunde.
- `.input`, `.badge-*`, `.skeleton`, `.section-label`: con tinta.
- Casilla nativa con piel propia (caja de tinta → verde con pop).
- Shell: pastilla de activo con el acento de cada sección (Hoy azul, Deporte
  verde, Nutrición rosa), raíl y barra inferior con borde de tinta.

**Migración de clases crudas** (para que la dirección llegue a todas las
pantallas): `text-sm/xs/lg/xl/2xl/3xl` → escala propia, `rounded-lg/md/xl/full`
→ radios del sistema, `bg-black/40` → `bg-scrim`, `from-black/60` + `text-white`
(título sobre la foto) → placa blanca con tinta, `bg-error` → `variant="danger"`,
`bg-primary-container text-white` → `text-on-primary` + `aria-pressed` en los
chips de categoría, CTA de plantillas → `<Button>`.

## Pieza estrella: recompensa al completar

- `/sesion/:fecha`: al marcar la última serie o cardio aparece el sello
  **«¡Hecho!»** (cae girado y rebota) y un confeti de 90 piezas en `<canvas>`
  propio (~1,5 s, sin librería; el componente entero ocupa 2,2 KB de código).
  Desmarcar una casilla lo retira. Con `prefers-reduced-motion` no hay confeti y
  el sello queda quieto.
- `/plan-fuerza`: chip amarillo **🔥 N semanas** junto a la semana: semanas ISO
  seguidas con al menos una sesión registrada (la semana en curso sin registrar
  no rompe la racha).
- Lógica pura con TDD: `web/src/lib/reward.ts` (`isSessionComplete`,
  `weekStreak`) + `web/tests/reward.test.ts` (12 casos, incluido el cambio de año
  ISO) y un test de pantalla en `sesion.test.tsx` y en `plan-fuerza.test.tsx`.

**Cómo verlo:** abre `/sesion/<fecha con sesión planificada>` y marca todas las
casillas; o mira el bloque «Recompensa» del catálogo `/ui`.

## Peso añadido (`web/dist/assets`, antes → después)

| Asset | Antes | Después | gzip antes → después |
|---|---|---|---|
| JS | 421,8 KB | 427,3 KB | 126,0 → 127,6 KB (+1,6 KB) |
| CSS | 39,4 KB | 40,8 KB | 8,2 → 8,7 KB (+0,4 KB) |
| Fuente (woff2) | — | 41,3 KB | carga en paralelo, `font-display: swap` |

Sin dependencias nuevas en tiempo de ejecución. Sin orígenes externos, así que la
CSP del Worker no cambia.

## Verificado

- `pnpm lint` y `pnpm typecheck` en verde.
- `pnpm --filter api test`: **210/210** (corrido tras los cambios).
- `pnpm --filter @esencial/web test`: **268/268** con
  `NODE_OPTIONS=--no-experimental-webstorage`. Sin ese flag, Node 25 rompe los 9
  tests de `shell.test.tsx` (su `localStorage` nativo tapa al de jsdom); pasa
  igual en `main` (3c8faa4, comprobado en un worktree temporal), así que es del
  entorno, no del cambio.
- Capturas revisadas, `innerWidth` comprobado en cada una: a **1280×800**
  `/`, `/login`, `/recetario`, `/recetario/:id`, `/recetario/nueva`,
  `/plan-recetas`, `/plan-fuerza`, `/plantillas`, `/plantillas/:id/editar`,
  `/ejercicios`, `/ejercicios/:id`, `/sesion/:fecha` (en borrador, con el sello y
  registrada) y `/ui`; a **390×844** las mismas rutas salvo el login a 1280, que
  se capturó en una pestaña sin sesión.
- Calendario a 1280×800: columna de día **152,28 px** (antes 152,84), sin
  scroll de página ni horizontal. **Coste**: el trazo de 2px y los paddings de
  la celda recortan el texto —título de sesión 62 px (antes 75) y receta
  56 px (antes 68); el ejercicio sube a 66 px (antes 54)—. Las celdas no se
  tocaron, por la decisión previa de AGENTS.md.
- Reduced-motion (emulado por CDP): el canvas del confeti nunca se dimensiona ni
  se pinta y el sello queda quieto en su giro final.
- Arreglado por el camino: desborde horizontal de `/recetario/nueva` en móvil
  (430 px → 390; rejilla sin `grid-cols-1` e inputs sin `min-w-0`) y la fecha de
  `/sesion`, que pasa de «Jueves, 24 De Septiembre» (`capitalize`) a
  «Jueves, 24 de septiembre» (`first-letter:uppercase`, visto en la captura).
  La placa del título sobre la foto de `/recetario/:id` en móvil está revisada
  con una foto real subida a R2.

## Lo que quedó fuera

- Transiciones de página (View Transitions): no aportaban a la pieza estrella.
- Recuperar el ancho de texto que se come el trazo en las celdas del calendario
  (−13 px en título de sesión y receta): exige tocar las celdas.
- Los títulos de más de ~20 caracteres siguen truncando en el calendario
  (decisión previa de no tocar las celdas).
