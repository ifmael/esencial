# Rediseño C — Sport-tech oscuro

Referentes: Whoop, Nike Training Club, Strava. Oscuro por defecto (casi negro
`#0a0c0f`, grises fríos), **lima** `#c6ff3d` para lo accionable y los datos,
**cian** `#38e1ff` como segundo acento para estados. Titulares y cifras en
Barlow Condensed (mayúsculas), interfaz en Space Grotesk y números tabulares en
toda la app.

## Qué cambió

- **Tokens** (`web/src/globals.css`): paleta oscura completa; `--color-scrim` /
  `--color-on-scrim` (velo de modales y texto sobre foto); `--font-ui` /
  `--font-numeric`; `text-display` pasa a 28 px y hay un paso nuevo, `text-metric`
  (44 px); radios más secos (8/10/14); sombras con filo de luz + `shadow-glow`;
  `--duration-count` 900 ms. Se borró `--color-primary-container`, que ya no
  usaba nadie.
- **Piel**: `.card`, `.btn-*` (nueva `.btn-danger`), `.input` (fondo hundido,
  `min-width: 0`), `.badge-*` (con borde), casillas oscuras, anillo
  (`.progress-ring-*`) y `.metric`.
- **Primitivas**: `Button variant="danger"`; `ProgressRing` y `CountUp` en
  `web/src/components/metrics.tsx`, con tests.
- **Migración de clases sueltas** en todas las pantallas: `text-sm/xs/lg/xl/2xl`
  pasan a la escala, `rounded-lg/xl/full` a `rounded-control/panel/chip`,
  `bg-black/40` a `bg-scrim`, `text-white` a `text-on-scrim`/`text-on-primary`, y
  los `bg-error` de las confirmaciones a `variant="danger"`. Los chips de
  categorías de /recetario/nueva ganan `aria-pressed`.
- **Datos**: marcador en /sesion/:fecha (anillo de series hechas + contadores
  animados) y anillo de sesiones de la semana en /plan-fuerza. Con
  `prefers-reduced-motion` las cifras aparecen ya con su valor final.
- **Catálogo /ui** y tabla de escala de `AGENTS.md` actualizados.

## Pieza estrella: mapa muscular 3D

Cómo verlo: /plantillas/nueva (selector) o /ejercicios/:id (ficha), botón
**3D**. Arrastrar gira la figura y un toque elige el músculo. La ficha gira sola,
despacio, y la elección 2D/3D se recuerda entre visitas.

- La geometría se saca **extruyendo los `path` de `data.ts`** (`SVGLoader` +
  `ExtrudeGeometry`): un mesh por pieza, ligado a su sub-región. La licencia
  Apache-2.0 se conserva (`LICENSE`/`NOTICE` sin tocar).
- El **SVG sigue siendo la capa accesible** también en 3D: queda transparente
  debajo, con sus `<g role=button>`, el teclado y `aria-pressed`. El foco de
  teclado ilumina el músculo en 3D. La selección es un único estado para las dos
  capas.
- El 3D solo se ofrece con WebGL y sin `prefers-reduced-motion`.
- `frameloop="demand"` y `dispose` de las geometrías al salir.
- Solo cuentan los clics sobre la cara que mira a la cámara. Si no, el rayo
  atravesaba los huecos: un clic en el pecho elegía el trapecio.
- Verificado en el navegador con `page.mouse.click` real: 7 de 8 puntos del
  frente dan músculos frontales (pecho, serrato, recto abdominal, bíceps, ingle,
  aductores) y el octavo cae en un hueco sin músculo. Los 4 de la espalda dan
  trapecio, columna, glúteo e isquios. Arrastrar gira sin elegir. Test sin
  WebGL: `web/tests/drag-gesture.test.ts` y `web/tests/body-map-stage.test.tsx`.

## Peso del bundle (`web/dist/assets`)

| | Antes | Después |
| --- | --- | --- |
| JS inicial | 421,83 kB (127,09 gz) | 429,33 kB (129,07 gz) → **+2 kB gz** (anillos, contadores, escenario) |
| CSS | 39,41 kB (8,26 gz) | 41,5 kB (≈8,9 gz) |
| Fuentes | — | 3 woff2 latinos, 67 kB (Barlow 600/700 + Space Grotesk variable). En dist hay además 2 `.woff` de Barlow (37,7 kB) de respaldo que los navegadores modernos no descargan |
| Chunk 3D (solo al pulsar «3D») | — | 938 kB (**251 kB gz**): three ≈75 %, R3F ≈24 % |

Fuera de las rutas del 3D, el bundle inicial no crece por el 3D: el chunk solo
se descarga al pulsar «3D».

## Verificación

- `pnpm lint` y `pnpm typecheck` en verde. `pnpm test`: 275/275 en web y 210/210
  en api.
- Capturas a 1280×800 y 390×844 de las 11 pantallas, revisadas. Casillas medidas: 20×20 en la lista de la compra (`size-5`, visible marcada y sin marcar) y 44×44 en /sesion; tamaño base de 1,25rem en `globals.css` para las casillas sin clase. /plan-fuerza y
  /plan-recetas a 1280×800: sin scroll de página ni horizontal, columna de
  153 px. A 390: ninguna pantalla con scroll horizontal. Conmutador 2D/3D de
  44 px.

## Lo que quedó fuera

- `pnpm test` en **Node 25** falla en `shell.test.tsx` (también en la base
  `3c8faa4`): el `localStorage` propio de Node tapa el de jsdom. Pasa con
  `NODE_OPTIONS=--no-experimental-webstorage`. No se tocó la config.
- El chunk 3D pesa 251 kB gz. Se podría bajar con `three/webgpu` o importando
  solo los módulos de three que se usan, o quitando R3F y usando three a pelo.
- No se comprobó si el desborde horizontal de /recetario/nueva a 390 px era
  previo al rediseño. Queda corregido (`grid-cols-1` + `min-width: 0` en
  `.input`).
- `wireframes/DESIGN.md` y `docs/architecture/diseno.html` siguen con la paleta
  anterior (manda `globals.css`).
- Sin e2e: los puertos de `pnpm e2e` chocan con los otros worktrees.
