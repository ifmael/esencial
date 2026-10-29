# Sistema de diseño M3 Expressive — handoff autocontenido

Pásale este fichero **entero** a la IA que trabajará en el otro proyecto. No necesita
acceso al repo de origen: los dos ficheros de los que cuelga todo el sistema
(`tokens.css` y `globals.css`) van **literales** en los anexos A y B, y las
primitivas, su comportamiento y los guardarraíles están especificados aquí.

Origen: app de bienestar personal en React 19 + Vite + Tailwind v4 + Cloudflare
Workers. Es un sistema **propio**, no una librería: se inspiró en Material 3
Expressive (Google, 2025 — Pixel/Android 16, Fitbit) y se implementó sobre tokens
y CSS, sin componentes de terceros (Material Web está en mantenimiento y no
implementa Expressive).

---

## 0. Encargo (a la IA receptora)

Porta el sistema al proyecto nuevo **sin improvisar ningún valor**. En este orden:

1. Copia el **anexo A** como `src/tokens.css` y el **anexo B** como
   `src/globals.css`, importados en ese orden (`globals.css` hace
   `@import "./tokens.css";`). No reordenes las capas del anexo B: el orden es
   parte del contrato.
2. Borra los bloques listados en §4: son de la app original, no del sistema.
3. Reescribe las primitivas en la tecnología del proyecto siguiendo el contrato
   de §9 (nombres de clase, medidas, variantes, estados y atributos ARIA son
   obligatorios; el idioma de implementación no).
4. Porta el guardarraíl de §11 y el catálogo de §12. No son opcionales: son lo
   que evita que el sistema se degrade en tres semanas.
5. Si el stack no es React 19 + Tailwind v4, **di qué capa pierdes y qué pones
   en su lugar** (§1). No traduzcas a lo bruto ni sustituyas tokens por valores
   sueltos.

Si algo no está en este documento, no existe en el sistema: pregunta antes de
inventarlo.

---

## 1. Prerrequisitos y stack

| Necesitas                                                       | Para qué                                                                                                                                                                                                 | Si no lo tienes                                                                                                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tailwind v4**                                                 | Capa 2 (`@theme inline`) y las utilidades `@utility` (`text-e`, `motion-*`, `tabular`). Las medidas de las primitivas (`h-12`, `px-6`, `size-12`) son la escala por defecto de Tailwind: **no** se vacía | En v3 o sin Tailwind: las capas 1 y 3 son CSS puro y funcionan igual; declara las variables y las utilidades a mano y pierdes el lint por familia de §11 (reduce su alcance a las clases arbitrarias) |
| **Una fuente variable** con ejes `wght`, `wdth`, `opsz`, `ROND` | `text-e` (peso 720, anchura 112 %, `ROND` 100) y `.type-move`                                                                                                                                            | Cambia `--font-sans` y ajusta los tres números de `text-e`; documenta el cambio                                                                                                                       |
| **Node**                                                        | Regenerar tokens (`gen-tokens.ts`) y correr el guardarraíl                                                                                                                                               | Regenera los tokens una vez a mano desde la semilla (§8)                                                                                                                                              |
| **React 19** (o equivalente)                                    | Las primitivas use `useSyncExternalStore`, `useId`, `aria-*`. La **piel no depende de React**: son clases                                                                                                | Reimplementa el markup con los mismos atributos; el CSS no cambia                                                                                                                                     |

La fuente del sistema, **Google Sans Flex**, es OFL (`OFL-google-sans-flex.txt`):
puedes copiarla. En el origen va auto-alojada (subset latino, `font-display:
swap`), recortada a 4 ejes = 169 KB woff2. Con `opsz` fijo bajaría a ~73 KB.

---

## 2. Las tres capas (un dueño cada una)

| Capa              | Fichero                                                      | Qué contiene                                                                                                                                                                                                                                 | Quién lo escribe                                                                 |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Valores crudos | `tokens.css` (generado) + el bloque `:root` de `globals.css` | Color M3 (32 roles, claro y oscuro), muelles M3E muestreados, forma, espaciado, elevación, capa de estado                                                                                                                                    | El generador y nadie más: a mano jamás                                           |
| 2. Puente         | `@theme inline` en `globals.css`                             | Vacía los espacios de nombres de Tailwind (`--color-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--animate-*` = `initial`) y expone los tokens con nombre de utilidad: `bg-surface-container-high`, `text-title-m`, `rounded-xl`, `shadow-2` | Una vez; al añadir un token                                                      |
| 3. Piel           | `@layer components` en `globals.css`                         | `.btn-*`, `.card-*`, `.input`, `.field`, `.chip`, `.fab`, `.connected`, `.checkbox`, `.switch`, `.badge-*`, `.alert-*`, `.dialog`, `.sheet`, `.menu`, `.toolbar`, `.snackbar`, `.state`, `.ripple`…                                          | **Solo los ficheros de las primitivas.** Una pantalla nunca escribe estas clases |

Encima hay utilidades compartidas que **sí** se aplican tal cual en las
pantallas: `.section-label`, `.list-row`, `.card-interactive`, `.skeleton`,
`.state` (siempre que el elemento tenga su propia piel), `.stagger`, `.type-move`,
`.tabular`, `.text-e`, `.scroll-x`, `motion-*`.

Consecuencia de vaciar los espacios de nombres: `text-sm`, `rounded-lg`,
`shadow-xl`, `bg-black/40`, `text-white`, `bg-red-500` o `duration-150` **no
generan CSS**. No es un olvido: es el sistema, y el lint lo comprueba.

**Los dos Workers / dos orígenes no forman parte del sistema de diseño.** Ignóralos.

---

## 3. Reglas duras (si solo lees una sección, esta)

1. **Una pantalla no escribe piel.** Pide la primitiva (`<Button>`, `<Card>`,
   `<Input>`). Escribir `className="card"` o `btn-primary` es un error de revisión.
2. **Ningún valor suelto.** Todo sale de un token. Se aceptan **derivados**:
   `var()`, `calc()`, `env()`, `min()`, `max()`, `clamp()`, `color-mix()`.
3. **48 px de área táctil** en todo lo pulsable. Excepciones documentadas con su
   motivo (en el origen: filas de 44 px y un botón de 40 px dentro de una columna
   de 151 px; un chip de 32 px se pulsan en 48 con un `::after`).
4. **Capa de estado M3 en todo pulsable** (`.state`): velo de `currentColor` a
   **8 %** hover, **10 %** foco y pulsación. La onda (`.ripple`) solo con puntero.
5. **Un único anillo de foco** en toda la app: `:focus-visible` → `3px solid
   var(--accent)`, offset 2 px.
6. **El error de un campo es `aria-invalid`**, nunca una clase aparte: es el
   gancho de estilo y de lector de pantalla a la vez, sin estado duplicado.
7. **Color: solo roles M3.** El texto sobre un color es su rol `on-*`. Todo par
   que se pinte de verdad debe dar **≥ 4,5:1** (§8).
8. **Jerarquía por tono, no por sombra.** Sombra (`shadow-1/2/3`) solo en: FAB,
   menús, tooltips, hojas, barra flotante y snackbar.
9. **El movimiento va en muelles**, nunca en una curva inventada: espaciales
   (rebotan) para forma, tamaño y posición; de efectos (no rebotan) para color y
   opacidad (§7).
10. **Todo lo animado se apaga con `prefers-reduced-motion`**: 1 ms y un fundido
    de 150 ms para lo que entra o cambia de estado.
11. **La forma de lo que cambia de forma es 28 px (`--radius-pill`), no `full`.**
    Con 9999 px la interpolación pasa por 9061, 2635 y 0 antes de asentarse: se
    ve como un salto a cuadrado. Con 28 la curva es 28 → 19,6 → 13,6 → 10,9 → 12.
12. **`.stagger` nunca en una lista ordenable** (dnd-kit mide las filas al empezar
    el arrastre y una fila a media entrada está desplazada).
13. **Cifras de contadores, series y cantidades llevan `.tabular`.**

---

## 4. Qué borrar del anexo B (era de la app original)

No son sistema: son piezas del dominio de origen. Bórralas si no tienes ese caso.

| Bloque                                                                                                                                                     | Por qué sobra                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-muscle`, `--color-muscle-strong`, `--color-body`, `--color-muscle-secondary`, `--color-muscle-stabilizer` (en `:root`) y sus 5 líneas en `@theme` | Colores de un mapa muscular                                                                                                                                               |
| `--color-on-photo` y `--color-photo-veil`                                                                                                                  | Texto sobre foto con velo del scrim; útil si tienes fotos a sangre, prescindible si no                                                                                    |
| `--container-calendar` (`110rem`) + su línea en `@theme`                                                                                                   | Ancho de una rejilla semanal                                                                                                                                              |
| `.chain`, `.chain-label`, `.chain-rows`                                                                                                                    | La caja de un bloque de ejercicios encadenados (biserie). Es genérico (caja tonal con etiqueta) si te sirve el patrón                                                     |
| `::view-transition-*(day-sheet)` y `::view-transition-*(week-grid)`, `@keyframes axis-*`, `:root[data-week-dir]`                                           | Patrones de transición de la app (abrir un modal desde una columna, cambiar de semana). El patrón `create` **sí** es del sistema: es «lo pulsado crece hasta lo que abre» |
| `.wavy-*`, `.loader path`, `.seal*`, `@keyframes wave-drift` / `seal-in` / `spin`                                                                          | Solo si no usas progreso ondulado, loader ni sello (usarlos es inocuo)                                                                                                    |

Todo lo demás es sistema y se copia tal cual, incluidos los `@keyframes`.

---

## 5. Tipografía

15 roles Material 3. Se usan como utilidades (`text-title-m`), nunca como
`text-sm`. La escala completa, con su interlineado, peso y tracking, está en
`@theme inline` (anexo B).

| Rol              | Tamaño       | Uso                                                  |
| ---------------- | ------------ | ---------------------------------------------------- |
| `display-l/m/s`  | 57 · 45 · 36 | Titulares de héroe (peso 460: los grandes van finos) |
| `headline-l/m/s` | 32 · 28 · 24 | Títulos de pantalla                                  |
| `title-l/m/s`    | 22 · 16 · 14 | Títulos de tarjeta, cabeceras de fila                |
| `body-l/m/s`     | 16 · 14 · 12 | Texto; `body-l` es el tamaño de un campo             |
| `label-l/m/s`    | 14 · 12 · 11 | Botones, chips, insignias, etiquetas                 |
- **`text-e`** = el mismo rol _emphasized_: peso **720**, anchura **112 %**,
  `ROND` **100**. Para momentos clave (el título de una ficha, la fecha del día).
  Es una utilidad, se combina: `text-display-s text-e`.
- `body` lleva `font-variation-settings: "ROND" 50` (terminaciones a medias:
  amable sin volverse infantil) y `font-optical-sizing: auto`.
- **Tipografía que se mueve**: `.type-move` anima `font-weight` y `font-stretch`
  con el muelle espacial rápido (la etiqueta activa del raíl pasa de 500 a 800).
- Números: `.tabular` (`font-variant-numeric: tabular-nums`).

---

## 6. Forma

| Token                    | Valor               | Uso                                                                                          |
| ------------------------ | ------------------- | -------------------------------------------------------------------------------------------- |
| `--radius-none/xs/s/m/l` | 0 · 4 · 8 · 12 · 16 | Piezas y contenedores; `s` para chips y piezas conectadas, `m` para filas, `l` para tarjetas |
| `--radius-l-inc`         | 20                  | Incremento de `l`                                                                            |
| `--radius-xl`            | 28                  | Diálogos, hojas, campos destacados                                                           |
| `--radius-xl-inc`        | 32                  | Incremento de `xl`                                                                           |
| `--radius-xxl`           | 48                  | Esquinas asimétricas (tarjetas destacadas: `rounded-xl rounded-tr-xxl`)                      |
| `--radius-full`          | 9999                | Solo lo que es círculo de verdad (avatares, el pulgar del switch)                            |
| `--radius-pill`          | **28**              | Lo que cambia de forma: botones, chips, piezas del grupo conectado, FAB                      |

**El morph (forma que cambia)** es el gesto de marca del sistema. Tres casos:

1. Un botón pasa de píldora a `--radius-m` (12) al pulsar, y se queda cuadrado
   mientras `aria-pressed="true"`.
2. La pieza elegida de un grupo conectado se vuelve píldora y toma el acento;
   la pulsada crece (`flex-grow: 1.35`) mientras sus vecinas ceden.
3. El FAB, con `aria-expanded="true"`, pasa a **círculo** y al color fuerte.

**Formas abstractas** (`Shape`, 11 nombres): cada una es una curva polar `r(θ)`
muestreada **siempre en los mismos 120 ángulos**, así que cambiar de forma es
interpolar el `d` del `<path>` (transición CSS de `d`, muelle espacial por
defecto). Sin eso, el morph es un salto.

```js
// Familias polares
superellipse(p, a = 1, b = 1) = t => ((|cos t / a|)^p + (|sin t / b|)^p)^(-1/p)
cookie(n, depth)              = t => 1 - depth * (1 - cos(n * t)) * 0.5
petals(n, base, sharp)        = t => base + (1 - base) * |cos(n * t / 2)|^sharp

// Las 11 formas
circle: () => 1
square: superellipse(5)
soft-diamond: superellipse(1.35)
pill: superellipse(2.8, 1, 0.62)
cookie-4: cookie(4, 0.14)   cookie-7: cookie(7, 0.12)
cookie-9: cookie(9, 0.10)   cookie-12: cookie(12, 0.08)
sunny: cookie(8, 0.16)
clover: petals(4, 0.52, 0.7)
flower: petals(8, 0.74, 0.8)
```

Muestreo: `t` de 0 a 2π en 120 pasos, **empezando en −π/2** (el primer punto
arriba, para que un lóbulo impar apunte hacia arriba); normaliza la caja para que
la forma toque sus cuatro bordes. `shapePath(name, size)` devuelve
`M x y L x y … Z`.

---

## 7. Movimiento

CSS no tiene muelles: los seis del esquema _expressive_ de M3E se resuelven
**analíticamente** (masa 1, ω = √k) y se muestrean en un `linear()` de 41 puntos,
con duración = el tiempo en asentarse a menos del 0,1 %. Se hace **una vez**, se
congela en `tokens.css` y en tiempo de ejecución no se calcula nada.

| Token             | k    | ζ   | ω (rad/s) | Duración | Dónde                          |
| ----------------- | ---- | --- | --------- | -------- | ------------------------------ |
| `spatial-fast`    | 800  | 0,6 | 28,3      | 360 ms   | Pulsar, morph, chips           |
| `spatial-default` | 380  | 0,8 | 19,5      | 435 ms   | Diálogos, hojas, entradas      |
| `spatial-slow`    | 200  | 0,8 | 14,1      | 600 ms   | Sello, progreso                |
| `effects-fast`    | 3800 | 1   | 61,6      | 150 ms   | Capa de estado, borde de campo |
| `effects-default` | 1600 | 1   | 40,0      | 231 ms   | Color, opacidad, sombra        |
| `effects-slow`    | 800  | 1   | 28,3      | 327 ms   | Onda (ripple)                  |

Regla de asignación: **espaciales** (`ζ < 1`, rebotan) para posición, tamaño y
forma; **de efectos** (`ζ = 1`, no rebotan) para color y opacidad. Un color que
rebota se ve mal; una posición que no rebota se ve muerta.

Para lo que no es un muelle —un fundido de salida— el easing estándar de M3:
`--ease-emphasized: cubic-bezier(0.2, 0, 0, 1)`.

Las utilidades `motion-spatial-fast`, `motion-spatial`, `motion-spatial-slow`,
`motion-effects-fast`, `motion-effects`, `motion-effects-slow` **emparejan
easing y duración**; se combinan con una `transition-*` que diga **qué** se
anima:

```html
<button class="transition-[border-radius,font-weight] motion-spatial-fast">
```

Fórmula, si necesitas regenerar (u otro juego de muelles):

```js
position(spring, t) {            // 0 → 1, partiendo del reposo
  w = sqrt(stiffness);
  if (dampingRatio < 1) {
    wd = w * sqrt(1 - z*z);
    return 1 - exp(-z*w*t) * (cos(wd*t) + (z*w/wd) * sin(wd*t));
  }
  return 1 - exp(-w*t) * (1 + w*t);        // crítica
}
// curva: muestrea 41 puntos entre t=0 y t=settle, con
// settle = último t con |1 - position(t)| > 0,001; duración = settle en ms
```

**Animaciones de entrada**: `rise` (opacidad + 12 px), `pop` (opacidad + escala
0,9), `fade-in`, `dialog-in`, `sheet-in`, `menu-in`, `toolbar-in`, `snackbar-in`.
Todas animan `translate`/`scale`/`rotate` **sueltos, no `transform`**: así no
pisan un `transform` en línea (dnd-kit, arrastre de una hoja).

`prefers-reduced-motion: reduce` (anexo B, al final): todo a 1 ms, lo que entra
en 150 ms de fundido, y fuera los giros, la deriva de la onda y las View
Transitions.

---

## 8. Color

Semilla de marca → esquema tonal M3 → 32 roles congelados, en claro y oscuro. En
el origen la semilla es `#15803d`, variante _fidelity_ (primary = la semilla tal
cual) y paletas secundaria/terciaria/neutras declaradas a mano (secundaria verde
azulado, terciaria ámbar h 55, neutros con un punto de color para que las
superficies no sean grises).

**Cómo cambiar la marca:** cambia la semilla y regenera `tokens.css` con la misma
receta (`brandScheme`): `primary` = semilla, `secondary` = `{h:175, c:24}`,
`tertiary` = `{h:55, c:48}`, `neutral` = `{h: semilla, c:6}`, `neutral-variant` =
`{h: semilla, c:10}`, `contrastLevel: 0`. El generador debe:

1. Emitir los 32 roles de `ROLES` en `:root` y en `:root[data-theme="dark"]`
   (este último con `color-scheme: dark`).
2. Emitir los 6 muelles.
3. **Imprimir el contraste WCAG de las 22 parejas** en la cabecera del fichero.
   Si alguna baja de 4,5 hay que corregir la receta, no el test.

Los dos roles propios, fuera de `MaterialDynamicColors`: `tertiary-soft`
(`tertiary.tone(dark ? 30 : 90)`) y `on-tertiary-soft` (`tone(dark ? 90 : 30)`).
Existen porque con _fidelity_ `tertiary-container` sale oscuro y no sirve como
fondo claro del indicador blando.

### Parejas que deben pasar AA (≥ 4,5:1)

`on-*` sobre su color (primary, primary-container, secondary,
secondary-container, tertiary, tertiary-container, tertiary-soft, error,
error-container); `on-surface` sobre `surface` y sobre `surface-container-highest`;
`on-surface-variant` sobre los dos anteriores; `primary`, `tertiary`, `secondary`
y `error` sobre `surface` y sobre `surface-container-high`;
`inverse-on-surface` e `inverse-primary` sobre `inverse-surface`.

En el origen: mínimo 4,53 en claro y 4,54 en oscuro; texto principal 16,32 y
14,31. Se miden con WCAG 2.x y se comprueban **con un test** cada vez que se
regeneran.

### Color por sección

Un contenedor declara su sección y **reescribe el acento**; los hijos solo usan
las variables, nunca un rol directo de color, cuando el color significa «sección»:

| Variable                                       | Qué es                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `--accent` / `--on-accent`                     | El color fuerte de la sección (botón `filled`, elegido, foco)                               |
| `--accent-container` / `--on-accent-container` | Su contenedor (FAB, cabeceras)                                                              |
| `--accent-soft` / `--on-accent-soft`           | Su contenedor **claro** (botón tonal, chip elegido, subitem de un cajón, aviso informativo) |

El mecanismo es un selector `[data-section="…"]` que reescribe las seis. En el
origen, tres secciones: `deporte` = primary, `hoy` = secondary, `nutricion` =
tertiary (este último usa `tertiary-soft` como `accent-soft`, porque con
fidelidad el `tertiary-container` es oscuro). Un cuarto juego —el color de una
foto— reescribe las mismas seis para teñir una pantalla, y si el resultado no
pasa AA se descarta y manda el de la sección.

Todo lo demás (marca, insignias de estado, catálogo de variantes) usa roles
fijos a propósito: no cambian de color al cambiar de sección.

### Otros usos del color

- **Deshabilitado**: texto `color-mix(on-surface 38%, transparent)`, fondo
  `color-mix(on-surface 10%, transparent)`, sin sombra ni borde.
- **Velo de superposición**: `color-mix(scrim 40%, transparent)`.
- **Capa de estado**: 8 / 10 / 10 % de `currentColor` (hover / foco / pulsación),
  16 % mientras se arrastra.
- **Texto sobre foto**: blanco fijo sobre un velo
  `color-mix(scrim 62%, transparent)`; y **toda** `<img>` de una foto que se lea
  en un canvas lleva `crossOrigin="use-credentials"` — si otra copia de la foto
  se pidió sin CORS, la caché sirve esa y la lectura falla.

---

## 9. Contrato de las primitivas

Nombres de clase, medidas, variantes y atributos son obligatorios: la piel del
anexo B los busca. El lenguaje de implementación, no.

### 9.1 Botones

| Primitiva                          | Markup y clases                                                 | Variantes                                                                                     | Medidas                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                           | `<button type="button" class="btn state btn-{variant} {size}">` | `filled` (principal, acento) · `tonal` (secundaria con peso) · `outlined` · `text` · `danger` | `sm` `h-10 px-4 text-label-l` · `md` `h-12 px-6 text-label-l` · `lg` `h-14 px-7 text-title-m` · `icon` `size-12` · `icon-sm` `size-10` |
| `buttonClass({variant,size})`      | —                                                               | —                                                                                             | Para `<a>`/`<Link>` que deben _parecer_ un botón                                                                                       |
| `SplitButton`                      | dos mitades unidas, esquinas interiores pequeñas                | `filled` · `tonal`                                                                            | El de `Button`                                                                                                                         |
| `ConnectedGroup` + `ConnectedItem` | `.connected` sobre `role="group"` con etiqueta                  | —                                                                                             | Piezas `h-10`, `flex: 1 1 auto`                                                                                                        |
| `Fab`                              | `.fab`, `extended` lleva etiqueta                               | `sm` 40 · `md` 56 · `lg` 96                                                                   | —                                                                                                                                      |
| `Chip`                             | `.chip state`                                                   | —                                                                                             | 32 px visibles, 48 de área (`::after`)                                                                                                 |

Comportamiento:

- **Toda** pieza pulsable: onda en `pointerdown` + capa de estado.
- Botón: al pulsar el radio baja a `--radius-m` y el peso sube a 700; con
  `aria-pressed="true"` se queda cuadrado.
- `SplitButton`: la flecha gira; el menú (piel `.menu`) se abre debajo o encima
  (`menuPlacement="top"`); **Escape y el toque fuera lo cierran**, y el foco
  vuelve a su botón.
- `ConnectedGroup`: reposo `surface-container-highest` /
  `on-surface-variant`, **sin especificidad** (`:where(.connected) > *`), para que
  un `.btn` dentro del grupo (SplitButton) conserve su piel. La elegida
  (`aria-pressed`, `aria-current="page"` o `aria-selected`) → píldora + acento +
  peso 700. **Ojo**: `utilities` de Tailwind gana a `@layer components`, así que
  un `bg-*` en la pieza tapa su regla de elegida: por eso el reposo vive en
  `:where()`.
- `Fab`: es uno de los pocos elevados (`shadow-3`); al pulsar escala 0,94; con
  `aria-expanded="true"` se vuelve círculo del color fuerte.

### 9.2 Superficies

| Primitiva            | Clases                                                                      | Notas                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Card`               | `.card` + `.card-{elevated\|filled\|outlined\|tonal}` (por defecto `tonal`) | Cada variante declara **su `--field-bg`**, para que la etiqueta flotante de un campo de dentro tape el borde con el color correcto |
| `cardClass(variant)` | —                                                                           | Para un `<Link>`, `<button>` o `<ul>` que hace de tarjeta                                                                          |
| `.card-interactive`  | —                                                                           | Tarjeta que se pulsa: al pulsar escala 0,98 y el radio sube a `--radius-xl`                                                        |
| `Alert`              | `.alert` + `.alert-{error\|info}`                                           | `error` → `role="alert"`; `info` → `role="status"`                                                                                 |
| `Badge`              | `.badge-{pending\|done\|neutral\|accent}`                                   | Significan «pendiente» / «hecho» en cualquier pantalla: en el origen son colores **fijos**, no de sección                          |
| `Kbd`                | tecla de atajo                                                              |                                                                                                                                    |
| `.section-label`     | Utilidad                                                                    | Etiqueta de sección (mayúsculas, `label-m`, 0,1em, peso 700)                                                                       |
| `.list-row`          | Utilidad                                                                    | Fila de lista (flex, `--spacing-stack`, `--radius-m`)                                                                              |
| `.skeleton`          | Utilidad                                                                    | Carga: tono `surface-container-high` que respira (nunca un barrido blanco: deslumbra en oscuro)                                    |

### 9.3 Campos

| Primitiva     | Clases                                                        | Notas                                                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Input`       | `.input`                                                      | Estilo **outlined** en toda la app: sobre superficies tonales un campo relleno se funde con la tarjeta. 48 px de alto, radio 4, borde `outline`; hover `on-surface`; foco borde `--accent` + sombra interior de 1 px; `aria-invalid` → borde `error`                                  |
| `Textarea`    | `.input resize-none`                                          |                                                                                                                                                                                                                                                                                       |
| `Select`      | `.input`                                                      |                                                                                                                                                                                                                                                                                       |
| `Field`       | `.field` + `.field-label` + `.field-support` / `.field-error` | Etiqueta **flotante**: flota con foco o con valor (`:placeholder-shown` con un placeholder de un espacio) a `translateY(-1.45rem) scale(0.75)`; con foco la etiqueta toma `--accent`; el error colorea etiqueta y texto y marca `aria-invalid`. Enlaza etiqueta, ayuda y error por id |
| `Checkbox`    | `.checkbox` (+ `.checkbox-target`)                            | Casilla de 18 px con **48 px** de área táctil alrededor; el visto entra con el muelle espacial                                                                                                                                                                                        |
| `Switch`      | `.switch`                                                     | 52×32; el pulgar **crece** al pulsar (1 → 1,75 rem) y salta con muelle                                                                                                                                                                                                                |
| `SearchBar`   | pastilla de 56 px con la lupa delante                         | `tone="high"` para usarla sobre un contenedor (diálogo, hoja), donde el tono por defecto se funde; el anillo de foco lo pinta la pastilla entera                                                                                                                                      |
| `ScrollStrip` | `.scroll-x` + `data-edge`                                     | Una sola línea que **nunca** envuelve: encoge y desplaza; el borde por el que queda contenido se desvanece (máscara de 28 px). Es el indicador de que hay más de lo que cabe                                                                                                          |

**Contrato de `--field-bg`**: cada superficie que puede contener un campo
declara `--field-bg` con **su propio fondo** (`.dialog` → `surface-container-high`,
`.sheet` → `surface-container-low`, `.menu` → `surface-container`, y cada variante
de `Card`). Es lo que hace que el recorte de la etiqueta flotante tape el borde
en vez de dejar una franja.

### 9.4 Superficies superpuestas

| Primitiva                          | Qué hace                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Scrim`                            | Velo que cierra al pulsar, **solo si el clic empieza y acaba en él** (no si se ha arrastrado desde dentro)                                                                                                                                                                                                                                                                                                                 |
| `Dialog`                           | Escritorio: centrado, radio 28. Por debajo de `md`, según `mobile`: `fullscreen` (por defecto), `sheet` (hoja inferior con asa) o `center`. Un solo `role="dialog"` con su etiqueta. Escape cierra                                                                                                                                                                                                                         |
| `Sheet`                            | Hoja inferior con asa arrastrable. Desde `md` es un panel lateral                                                                                                                                                                                                                                                                                                                                                          |
| `OverlayHeader`                    | Cabecera estándar de hoja o diálogo: título + cerrar                                                                                                                                                                                                                                                                                                                                                                       |
| `useTooltip(content, delay = 500)` | Tooltip **enriquecido** (puede llevar foto y texto). Aparece tras 500 ms con el cursor o con el foco de teclado; se cierra al salir, al perder el foco, con Escape (pila de capas) o al desplazar. Se pinta `fixed` — el `overflow` de un contenedor lo recortaría — y **como hermano** del disparador, nunca dentro: dentro, su texto entraría en el nombre accesible del enlace. Ancho fijo 224 px. No recibe el puntero |
| `SnackbarHost` + `useSnackbar()`   | Un snackbar global con «Deshacer». **Uno a la vez** (el nuevo sustituye al viejo), 6 s, y cada `onUndo` se ejecuta **como mucho una vez**. La acción ya está hecha cuando se muestra: `onUndo` la revierte. Piel `.snackbar` (`inverse-surface`, radio 8) y acción en `inverse-primary`                                                                                                                                    |

**Arrastre de la hoja** (puro, con test): al tirar hacia abajo, 1:1; hacia arriba
(ya está en su tope) con resistencia `-24 * (1 - exp(dy / 80))`. Al soltar, cierra
si bajó **más de un tercio de su alto** o si la velocidad hacia abajo supera
**0,5 px/ms**; si no, vuelve con el muelle. El scroll de dentro no compite: el
gesto vive en el asa.

### 9.5 Piezas expresivas (SVG + CSS, sin librería)

| Primitiva            | Qué es                                                                                                                                 | Movimiento                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `Shape({name,size})` | Forma M3E rellena de `currentColor`                                                                                                    | Cambiar `name` la transforma: transición de `d`, muelle espacial          |
| `Loader`             | Una forma que gira y se transforma en la siguiente de una secuencia                                                                    | `.loader path` a 420 ms; el texto («Cargando…») queda solo para el lector |
| `WavyProgress`       | Progreso lineal ondulado: lo hecho ondula, la pista es recta. `waveOnly` = solo la ola que avanza                                      | La onda deriva sola; el avance con el muelle espacial lento               |
| `WavyRing`           | El mismo progreso en círculo, con la cifra dentro. `waveOnly`: sin círculo de fondo (a 0 no pinta nada y el arco crece con lo marcado) | Ídem                                                                      |
| `CountUp`            | Cifra que cuenta hasta su valor en 900 ms (ease-out quart, entero)                                                                     | El lector oye solo el valor final                                         |
| `RewardSeal`         | Sello de recompensa: galleta de 12 lóbulos (sol) que entra con el muelle espacial lento, con la cifra dentro. **Sin confeti**          | `.seal` + rotación muy lenta del borde                                    |
| `EmptyState`         | Composición de tres formas del color de la sección + texto                                                                             |                                                                           |
| `Monogram`           | Miniatura sin foto: una forma M3E **estable por nombre** (el mismo nombre, la misma forma) con su inicial                              |                                                                           |

### 9.6 Iconos

Material Symbols **Rounded**, en línea (SVG, `fill="currentColor"`), generados
por script desde un juego de nombres — solo los que se usan, no la fuente entera.
El icono del destino activo va `filled`; el resto, contorno. Un icono dentro de
un botón hereda su color y su área de 48 px.

---

## 10. Comportamiento compartido

| Mecanismo                                           | Contrato                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Onda** (`.ripple`)                                | La dispara solo `pointerdown` (el teclado ya tiene la capa de estado de `:focus-visible`); el elemento se monta a sí mismo y se retira al acabar la animación. `--state-drag` = 16 % mientras se arrastra                                                                                                                                                                                                                                                                                                                                                  |
| **Pila de Escape**                                  | Diálogos, hojas y menús se apilan al abrirse y un **único** listener de `window` avisa solo a la capa de encima. Un Escape que otro ya gestionó (`event.defaultPrevented`: por ejemplo dnd-kit cancelando un arrastre de teclado) **no** cierra nada. Esto sustituye a la guarda frágil de «mira si alguien ya lo previno»                                                                                                                                                                                                                                 |
| **Tema**                                            | `system` \| `light` \| `dark`, en `localStorage` bajo una clave propia, aplicado como `data-theme` en `<html>`. Un script clásico **en el `<head>`, antes del primer pintado**, pone el tema (la página sale en su tema aunque el bundle tarde o no llegue: medido con el JS bloqueado). Con «sistema», sigue el cambio del sistema en vivo (`matchMedia`). En el origen se elige solo en Ajustes y en la paleta de comandos. La regla del script y la del código (clave + resolución) se atan con un test                                                 |
| **Transformación de contenedor** (View Transitions) | Lo que se pulsa **crece hasta lo que abre**: el mismo `view-transition-name` (`create`) en el origen en la foto «antes» y en el destino en la «después» — dos iguales anulan la transición. El origen se despide pronto (`--duration-effects-fast`) y el contenido del destino llena el contenedor (`height: 100%`, `object-fit: cover`, `overflow: clip`), si no se ve estirado mientras crece. El destino apaga su propia animación de entrada: la hace la transición. Carga directa y editar no animan. Con movimiento reducido, no hay View Transition |

---

## 11. Guardarraíl: que no se degrade

Un script en el lint (se corre con `pnpm lint`, y hay tests para sus funciones
puras) recorre los fuentes de UI y **falla** en tres casos:

1. **Valor suelto**: una clase arbitraria que inventa un valor —
   `rounded-[7px]`, `text-[10px]`, `gap-[5px]` — en cualquiera de estas familias:
   `rounded`, `text`, `duration`, `ease`, `shadow`, `gap(-x/-y)`, `p(-x/-y/-t/-b/-l/-r)`,
   `m(-x/-y/-t/-b/-l/-r)`. Se aceptan los **derivados** (`var()`, `calc()`,
   `env()`, `url()`, `min()`, `max()`, `clamp()`, `color-mix()`): esos no
   inventan una escala, la consumen.
2. **Piel a mano en una pantalla**: `className="card"`, `btn-primary`, `input`,
   `badge-*`… Los únicos ficheros exentos son los de las primitivas.
3. **Escala cruda de Tailwind** (`text-sm`, `rounded-lg`, `shadow-xl`,
   `bg-black/40`, `text-white`, `bg-red-500`, `duration-150`) y la del sistema
   anterior si la hubo (`text-caption`, `rounded-card`, `text-text-secondary`).

Además: un script de generación **regenera** `tokens.css` desde la semilla, y un
test falla si el fichero versionado se desvía del generador. Con eso, «cambiar la
marca» es cambiar una constante y correr un comando.

---

## 12. Catálogo de variantes (obligatorio)

Una ruta interna (en el origen `/ui`, alcanzable desde Ajustes y desde la paleta)
que pinta **todas** las piezas en todas sus variantes, estados y tamaños, con su
movimiento: botones y sus 5 variantes, grupo conectado, chips, campos, casilla y
switch, insignias, avisos, tarjetas, diálogo, hoja, menú, snackbar, formas,
progreso, sello.

Es lo que convierte el sistema en algo que se **mira** en vez de algo que se
recuerda, y lo primero que se le enseña a quien entra al proyecto. Se mira antes
de inventar una pieza nueva. Si no encaja ninguna primitiva: primero el token
(`:root` + `@theme inline`), después la primitiva, y solo entonces la pantalla.

---

## 13. Checklist de aceptación

1. `tokens.css` regenerado y **todas las parejas AA ≥ 4,5** en claro y oscuro
   (el generador las imprime).
2. El guardarraíl de §11 pasa sobre todos los fuentes de UI.
3. El catálogo de §12 pinta todo sin errores y **en los dos temas**.
4. `prefers-reduced-motion: reduce`: transiciones a 1 ms, lo que entra con
   fundido de 150 ms, sin giros ni View Transitions.
5. Todo lo pulsable, medido: ≥ 48 px de área, con las excepciones escritas en el
   código y en el documento.
6. Teclado: un solo anillo de foco visible, Escape cierra **solo** la capa de
   encima, el foco vuelve al disparador al cerrar un menú.
7. Sin destello de tema: con el JS bloqueado, la página ya sale en su tema.
8. Cifras de contadores y series con `.tabular`.
9. Ninguna pantalla escribe una clase de piel; ninguna pantalla tiene un valor
   de medida que no salga de un token.
10. Los campos: error con `aria-invalid`, etiqueta flotante, y el recorte de la
    etiqueta tapa el borde (`--field-bg` declarado en cada superficie que los
    contiene).

---

## Anexo A — `src/tokens.css` (generado; copia literal)

Este fichero lo escribe el generador, nunca se edita a mano. Su cabecera imprime
el contraste de cada pareja para que el valor esté a la vista de quien lo lee.

```css
/* GENERADO por web/scripts/gen-tokens.ts — no editar a mano.
   Esquema tonal M3 desde la semilla #15803d y muelles M3E (esquema
   expressive) muestreados en linear(). Contraste WCAG de cada pareja
   texto/fondo (todas ≥ 4,5):
   claro
   on-primary / primary: 7.25
   on-primary-container / primary-container: 4.55
   on-secondary / secondary: 6.49
   on-secondary-container / secondary-container: 4.53
   on-tertiary / tertiary: 7.20
   on-tertiary-container / tertiary-container: 4.54
   on-tertiary-soft / tertiary-soft: 7.29
   on-error / error: 6.46
   on-error-container / error-container: 7.24
   on-surface / surface: 16.32
   on-surface / surface-container-highest: 13.25
   on-surface-variant / surface: 8.96
   on-surface-variant / surface-container-highest: 7.28
   primary / surface: 6.91
   primary / surface-container-high: 5.93
   tertiary / surface: 6.87
   tertiary / surface-container-high: 5.90
   secondary / surface: 6.19
   secondary / surface-container-high: 5.31
   error / surface: 6.16
   inverse-on-surface / inverse-surface: 11.55
   inverse-primary / inverse-surface: 7.69
   oscuro
   on-primary / primary: 7.72
   on-primary-container / primary-container: 4.55
   on-secondary / secondary: 7.75
   on-secondary-container / secondary-container: 4.54
   on-tertiary / tertiary: 7.73
   on-tertiary-container / tertiary-container: 4.54
   on-tertiary-soft / tertiary-soft: 7.29
   on-error / error: 7.72
   on-error-container / error-container: 7.24
   on-surface / surface: 14.31
   on-surface / surface-container-highest: 9.55
   on-surface-variant / surface: 10.82
   on-surface-variant / surface-container-highest: 7.22
   primary / surface: 10.85
   primary / surface-container-high: 8.47
   tertiary / surface: 10.87
   tertiary / surface-container-high: 8.48
   secondary / surface: 10.86
   secondary / surface-container-high: 8.48
   error / surface: 10.88
   inverse-on-surface / inverse-surface: 10.14
   inverse-primary / inverse-surface: 5.04
*/

:root {
  --color-primary: #00652c;
  --color-on-primary: #ffffff;
  --color-primary-container: #15803d;
  --color-on-primary-container: #d3ffd5;
  --color-secondary: #3c6659;
  --color-on-secondary: #ffffff;
  --color-secondary-container: #bbe9d8;
  --color-on-secondary-container: #406b5d;
  --color-tertiary: #894500;
  --color-on-tertiary: #ffffff;
  --color-tertiary-container: #a95b13;
  --color-on-tertiary-container: #fff1ea;
  --color-tertiary-soft: #ffdcc5;
  --color-on-tertiary-soft: #703700;
  --color-error: #ba1a1a;
  --color-on-error: #ffffff;
  --color-error-container: #ffdad6;
  --color-on-error-container: #93000a;
  --color-surface: #f7fbf2;
  --color-surface-dim: #d7dbd3;
  --color-surface-bright: #f7fbf2;
  --color-surface-container-lowest: #ffffff;
  --color-surface-container-low: #f1f5ed;
  --color-surface-container: #ebefe7;
  --color-surface-container-high: #e5eae1;
  --color-surface-container-highest: #dfe4dc;
  --color-on-surface: #181d18;
  --color-on-surface-variant: #3f493f;
  --color-outline: #707a6e;
  --color-outline-variant: #bfc9bc;
  --color-inverse-surface: #2d322c;
  --color-inverse-on-surface: #eef2ea;
  --color-inverse-primary: #79db8d;
  --color-scrim: #000000;
  /* k=800, ζ=0.6 (ω=28.3 rad/s) */
  --ease-spatial-fast: linear(
    0,
    0.029,
    0.105,
    0.21,
    0.331,
    0.458,
    0.581,
    0.696,
    0.797,
    0.882,
    0.952,
    1.006,
    1.045,
    1.072,
    1.088,
    1.094,
    1.094,
    1.088,
    1.079,
    1.068,
    1.056,
    1.045,
    1.033,
    1.023,
    1.014,
    1.007,
    1.001,
    0.997,
    0.994,
    0.992,
    0.991,
    0.991,
    0.991,
    0.992,
    0.993,
    0.994,
    0.995,
    0.996,
    0.997,
    0.998,
    1
  );
  --duration-spatial-fast: 360ms;
  /* k=380, ζ=0.8 (ω=19.5 rad/s) */
  --ease-spatial-default: linear(
    0,
    0.02,
    0.072,
    0.143,
    0.227,
    0.316,
    0.406,
    0.492,
    0.573,
    0.646,
    0.712,
    0.77,
    0.82,
    0.863,
    0.898,
    0.927,
    0.951,
    0.969,
    0.984,
    0.995,
    1.003,
    1.008,
    1.012,
    1.014,
    1.015,
    1.015,
    1.015,
    1.014,
    1.013,
    1.011,
    1.01,
    1.009,
    1.007,
    1.006,
    1.005,
    1.004,
    1.003,
    1.003,
    1.002,
    1.001,
    1
  );
  --duration-spatial-default: 435ms;
  /* k=200, ζ=0.8 (ω=14.1 rad/s) */
  --ease-spatial-slow: linear(
    0,
    0.02,
    0.072,
    0.144,
    0.227,
    0.317,
    0.406,
    0.492,
    0.573,
    0.647,
    0.713,
    0.771,
    0.821,
    0.863,
    0.898,
    0.927,
    0.951,
    0.969,
    0.984,
    0.995,
    1.003,
    1.008,
    1.012,
    1.014,
    1.015,
    1.015,
    1.015,
    1.014,
    1.013,
    1.011,
    1.01,
    1.009,
    1.007,
    1.006,
    1.005,
    1.004,
    1.003,
    1.003,
    1.002,
    1.001,
    1
  );
  --duration-spatial-slow: 600ms;
  /* k=3800, ζ=1 (ω=61.6 rad/s) */
  --ease-effects-fast: linear(
    0,
    0.023,
    0.079,
    0.154,
    0.237,
    0.321,
    0.404,
    0.481,
    0.552,
    0.615,
    0.672,
    0.721,
    0.764,
    0.802,
    0.833,
    0.861,
    0.884,
    0.903,
    0.92,
    0.933,
    0.945,
    0.954,
    0.962,
    0.969,
    0.974,
    0.979,
    0.983,
    0.986,
    0.988,
    0.991,
    0.992,
    0.994,
    0.995,
    0.996,
    0.997,
    0.997,
    0.998,
    0.998,
    0.999,
    0.999,
    1
  );
  --duration-effects-fast: 150ms;
  /* k=1600, ζ=1 (ω=40.0 rad/s) */
  --ease-effects-default: linear(
    0,
    0.023,
    0.079,
    0.153,
    0.236,
    0.321,
    0.403,
    0.481,
    0.551,
    0.615,
    0.671,
    0.721,
    0.764,
    0.801,
    0.833,
    0.86,
    0.883,
    0.903,
    0.919,
    0.933,
    0.945,
    0.954,
    0.962,
    0.969,
    0.974,
    0.979,
    0.983,
    0.986,
    0.988,
    0.991,
    0.992,
    0.994,
    0.995,
    0.996,
    0.997,
    0.997,
    0.998,
    0.998,
    0.998,
    0.999,
    1
  );
  --duration-effects-default: 231ms;
  /* k=800, ζ=1 (ω=28.3 rad/s) */
  --ease-effects-slow: linear(
    0,
    0.023,
    0.079,
    0.154,
    0.237,
    0.321,
    0.404,
    0.481,
    0.552,
    0.615,
    0.672,
    0.722,
    0.765,
    0.802,
    0.834,
    0.861,
    0.884,
    0.903,
    0.92,
    0.933,
    0.945,
    0.954,
    0.962,
    0.969,
    0.975,
    0.979,
    0.983,
    0.986,
    0.988,
    0.991,
    0.992,
    0.994,
    0.995,
    0.996,
    0.997,
    0.997,
    0.998,
    0.998,
    0.999,
    0.999,
    1
  );
  --duration-effects-slow: 327ms;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --color-primary: #79db8d;
  --color-on-primary: #003916;
  --color-primary-container: #15803d;
  --color-on-primary-container: #d3ffd5;
  --color-secondary: #a3d0c0;
  --color-on-secondary: #08372c;
  --color-secondary-container: #265144;
  --color-on-secondary-container: #95c2b2;
  --color-tertiary: #ffb783;
  --color-on-tertiary: #4f2500;
  --color-tertiary-container: #a95b13;
  --color-on-tertiary-container: #fff1ea;
  --color-tertiary-soft: #703700;
  --color-on-tertiary-soft: #ffdcc5;
  --color-error: #ffb4ab;
  --color-on-error: #690005;
  --color-error-container: #93000a;
  --color-on-error-container: #ffdad6;
  --color-surface: #101510;
  --color-surface-dim: #101510;
  --color-surface-bright: #363a35;
  --color-surface-container-lowest: #0b0f0b;
  --color-surface-container-low: #181d18;
  --color-surface-container: #1c211c;
  --color-surface-container-high: #262b26;
  --color-surface-container-highest: #313631;
  --color-on-surface: #dfe4dc;
  --color-on-surface-variant: #bfc9bc;
  --color-outline: #899487;
  --color-outline-variant: #3f493f;
  --color-inverse-surface: #dfe4dc;
  --color-inverse-on-surface: #2d322c;
  --color-inverse-primary: #006d30;
  --color-scrim: #000000;
}
```

---

## Anexo B — `src/globals.css` (copia literal)

Tres capas en orden: `:root` (valores crudos), `@theme inline` (puente a
Tailwind), `@layer base` + `@layer components` (piel). Después, utilidades
compartidas, animaciones de entrada, keyframes, View Transitions y
`prefers-reduced-motion`. El orden es parte del contrato.

```css
@import "tailwindcss";
/* Color M3 (claro/oscuro) y muelles M3E: valores calculados y congelados por
   scripts/gen-tokens.ts. Todo lo demás del sistema vive aquí. */
@import "./tokens.css";

/* ==========================================================================
   Esencial — Material 3 Expressive
   Tres capas, un dueño cada una (AGENTS.md § Sistema de diseño):
   1. :root / tokens.css  — valores crudos.
   2. @theme inline       — el puente a utilidades de Tailwind.
   3. @layer components   — la piel de las primitivas de components/ui.tsx.
   ========================================================================== */

/* Google Sans Flex (OFL, ver fonts/OFL-google-sans-flex.txt): subset latino y
   ejes recortados a lo que usa la app (wght 400–800, wdth 100–125, opsz 12–60,
   ROND 0–100). Mismo origen: la CSP no cambia. */
@font-face {
  font-family: "Google Sans Flex";
  src: url("./fonts/google-sans-flex-latin.woff2") format("woff2");
  font-weight: 400 800;
  font-stretch: 100% 125%;
  font-style: normal;
  font-display: swap;
}

:root {
  /* --- Color: derivados de los roles M3 --------------------------------- */
  /* Capa de estado M3: el color «on» de la superficie a 8/10/10 %. */
  --state-hover: 0.08;
  --state-focus: 0.1;
  --state-press: 0.1;
  --state-drag: 0.16;
  /* Texto e iconos sobre foto: blanco fijo sobre un velo del scrim. */
  --color-on-photo: #ffffff;
  --color-photo-veil: color-mix(in srgb, var(--color-scrim) 62%, transparent);
  /* Mapa corporal: músculo en reposo y su realce (el elegido: primary). */
  --color-muscle: color-mix(
    in srgb,
    var(--color-primary) 38%,
    var(--color-surface-container-high)
  );
  --color-muscle-strong: color-mix(
    in srgb,
    var(--color-primary) 58%,
    var(--color-surface-container-high)
  );
  --color-body: var(--color-outline-variant);
  /* Grado de un músculo en su ejercicio: el principal va en primary y los
     otros dos bajan de intensidad (luminosidad, no tono: se distinguen igual
     con daltonismo). */
  --color-muscle-secondary: color-mix(
    in srgb,
    var(--color-primary) 55%,
    var(--color-surface-container-high)
  );
  --color-muscle-stabilizer: color-mix(
    in srgb,
    var(--color-primary) 28%,
    var(--color-surface-container-high)
  );

  /* Color de la sección activa: lo reescriben [data-section] y el color
     dinámico de receta. Deporte = primary, Nutrición = tertiary, Hoy = secondary.
     `accent-soft` es el contenedor claro del subitem activo del cajón. */
  --accent: var(--color-primary);
  --on-accent: var(--color-on-primary);
  --accent-container: var(--color-primary-container);
  --on-accent-container: var(--color-on-primary-container);
  --accent-soft: var(--color-secondary-container);
  --on-accent-soft: var(--color-on-secondary-container);

  /* --- Forma: escala de esquinas M3E ------------------------------------ */
  --radius-none: 0;
  --radius-xs: 4px;
  --radius-s: 8px;
  --radius-m: 12px;
  --radius-l: 16px;
  --radius-l-inc: 20px;
  --radius-xl: 28px;
  --radius-xl-inc: 32px;
  --radius-xxl: 48px;
  --radius-full: 9999px;
  /* «Completo» de las piezas que cambian de forma: la mitad del alto de un
     control de 56 px. Con 9999px la interpolación del morph (9999 → 12) pasa
     casi toda por valores imposibles y el muelle cruza el cero: se ve como un
     salto. Con un radio real el muelle se ve redondeando → cuadrando. */
  --radius-pill: 28px;

  /* --- Espaciado semántico (ritmo) --------------------------------------- */
  --spacing-card: 1.25rem; /* 20 */
  --spacing-section: 2rem; /* 32 */
  --spacing-stack: 0.75rem; /* 12 */
  --spacing-gutter: 1rem; /* 16 */
  --container-calendar: 110rem; /* 1760 */

  /* --- Elevación: solo FAB, menús, hojas y barra flotante --------------- */
  --shadow-1: 0 1px 2px rgb(0 0 0 / 0.3), 0 1px 3px 1px rgb(0 0 0 / 0.15);
  --shadow-2: 0 1px 2px rgb(0 0 0 / 0.3), 0 2px 6px 2px rgb(0 0 0 / 0.15);
  --shadow-3: 0 4px 8px 3px rgb(0 0 0 / 0.15), 0 1px 3px rgb(0 0 0 / 0.3);

  /* --- Movimiento -------------------------------------------------------- */
  /* Muelles (tokens.css): --ease-spatial-{fast,default,slow} rebotan (posición,
     tamaño, forma); --ease-effects-* no (color, opacidad). Cada uno con su
     --duration-* (lo que tarda en asentarse). Para lo que no es un muelle —un
     fundido de salida— el easing estándar de M3: */
  --ease-emphasized: cubic-bezier(0.2, 0, 0, 1);
}

@theme inline {
  --color-*: initial;
  --color-primary: var(--color-primary);
  --color-on-primary: var(--color-on-primary);
  --color-primary-container: var(--color-primary-container);
  --color-on-primary-container: var(--color-on-primary-container);
  --color-secondary: var(--color-secondary);
  --color-on-secondary: var(--color-on-secondary);
  --color-secondary-container: var(--color-secondary-container);
  --color-on-secondary-container: var(--color-on-secondary-container);
  --color-tertiary: var(--color-tertiary);
  --color-on-tertiary: var(--color-on-tertiary);
  --color-tertiary-container: var(--color-tertiary-container);
  --color-on-tertiary-container: var(--color-on-tertiary-container);
  --color-tertiary-soft: var(--color-tertiary-soft);
  --color-on-tertiary-soft: var(--color-on-tertiary-soft);
  --color-error: var(--color-error);
  --color-on-error: var(--color-on-error);
  --color-error-container: var(--color-error-container);
  --color-on-error-container: var(--color-on-error-container);
  --color-surface: var(--color-surface);
  --color-surface-dim: var(--color-surface-dim);
  --color-surface-bright: var(--color-surface-bright);
  --color-surface-container-lowest: var(--color-surface-container-lowest);
  --color-surface-container-low: var(--color-surface-container-low);
  --color-surface-container: var(--color-surface-container);
  --color-surface-container-high: var(--color-surface-container-high);
  --color-surface-container-highest: var(--color-surface-container-highest);
  --color-on-surface: var(--color-on-surface);
  --color-on-surface-variant: var(--color-on-surface-variant);
  --color-outline: var(--color-outline);
  --color-outline-variant: var(--color-outline-variant);
  --color-inverse-surface: var(--color-inverse-surface);
  --color-inverse-on-surface: var(--color-inverse-on-surface);
  --color-inverse-primary: var(--color-inverse-primary);
  --color-scrim: var(--color-scrim);
  --color-on-photo: var(--color-on-photo);
  --color-photo-veil: var(--color-photo-veil);
  --color-muscle: var(--color-muscle);
  --color-muscle-strong: var(--color-muscle-strong);
  --color-body: var(--color-body);
  --color-muscle-secondary: var(--color-muscle-secondary);
  --color-muscle-stabilizer: var(--color-muscle-stabilizer);
  --color-accent: var(--accent);
  --color-on-accent: var(--on-accent);
  --color-accent-container: var(--accent-container);
  --color-on-accent-container: var(--on-accent-container);
  --color-accent-soft: var(--accent-soft);
  --color-on-accent-soft: var(--on-accent-soft);
  --color-transparent: transparent;
  --color-current: currentColor;

  --font-sans:
    "Google Sans Flex", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;

  /* Escala tipográfica M3 (tamaño / interlineado / peso / tracking). Las
     variantes *-e (emphasized) suben peso y anchura: momentos clave. */
  --text-*: initial;
  --text-display-l: 3.5625rem;
  --text-display-l--line-height: 4rem;
  --text-display-l--letter-spacing: -0.016em;
  --text-display-l--font-weight: 460;
  --text-display-m: 2.8125rem;
  --text-display-m--line-height: 3.25rem;
  --text-display-m--font-weight: 460;
  --text-display-s: 2.25rem;
  --text-display-s--line-height: 2.75rem;
  --text-display-s--font-weight: 460;
  --text-headline-l: 2rem;
  --text-headline-l--line-height: 2.5rem;
  --text-headline-l--font-weight: 500;
  --text-headline-m: 1.75rem;
  --text-headline-m--line-height: 2.25rem;
  --text-headline-m--font-weight: 500;
  --text-headline-s: 1.5rem;
  --text-headline-s--line-height: 2rem;
  --text-headline-s--font-weight: 500;
  --text-title-l: 1.375rem;
  --text-title-l--line-height: 1.75rem;
  --text-title-l--font-weight: 500;
  --text-title-m: 1rem;
  --text-title-m--line-height: 1.5rem;
  --text-title-m--letter-spacing: 0.009em;
  --text-title-m--font-weight: 600;
  --text-title-s: 0.875rem;
  --text-title-s--line-height: 1.25rem;
  --text-title-s--letter-spacing: 0.007em;
  --text-title-s--font-weight: 600;
  --text-body-l: 1rem;
  --text-body-l--line-height: 1.5rem;
  --text-body-l--letter-spacing: 0.009em;
  --text-body-l--font-weight: 400;
  --text-body-m: 0.875rem;
  --text-body-m--line-height: 1.25rem;
  --text-body-m--letter-spacing: 0.016em;
  --text-body-m--font-weight: 400;
  --text-body-s: 0.75rem;
  --text-body-s--line-height: 1rem;
  --text-body-s--letter-spacing: 0.033em;
  --text-body-s--font-weight: 400;
  --text-label-l: 0.875rem;
  --text-label-l--line-height: 1.25rem;
  --text-label-l--letter-spacing: 0.007em;
  --text-label-l--font-weight: 600;
  --text-label-m: 0.75rem;
  --text-label-m--line-height: 1rem;
  --text-label-m--letter-spacing: 0.04em;
  --text-label-m--font-weight: 600;
  --text-label-s: 0.6875rem;
  --text-label-s--line-height: 1rem;
  --text-label-s--letter-spacing: 0.045em;
  --text-label-s--font-weight: 600;

  --spacing-card: var(--spacing-card);
  --spacing-section: var(--spacing-section);
  --spacing-stack: var(--spacing-stack);
  --spacing-gutter: var(--spacing-gutter);
  --container-calendar: var(--container-calendar);

  --radius-*: initial;
  --radius-none: var(--radius-none);
  --radius-xs: var(--radius-xs);
  --radius-s: var(--radius-s);
  --radius-m: var(--radius-m);
  --radius-l: var(--radius-l);
  --radius-l-inc: var(--radius-l-inc);
  --radius-xl: var(--radius-xl);
  --radius-xl-inc: var(--radius-xl-inc);
  --radius-xxl: var(--radius-xxl);
  --radius-full: var(--radius-full);

  --shadow-*: initial;
  --shadow-1: var(--shadow-1);
  --shadow-2: var(--shadow-2);
  --shadow-3: var(--shadow-3);

  --animate-*: initial;
}

/* Variantes *emphasized*: el mismo rol con más peso y un punto de anchura. */
@utility text-e {
  font-weight: 720;
  font-stretch: 112%;
  font-variation-settings: "ROND" 100;
}

/* Movimiento en utilidades: cada una empareja el muelle con su duración de
   asentamiento. `motion-spatial*` para posición/tamaño/forma (rebota),
   `motion-effects*` para color/opacidad (sin rebote). Se combinan con una
   `transition-*` de Tailwind que diga QUÉ se anima. */
@utility motion-spatial-fast {
  transition-duration: var(--duration-spatial-fast);
  transition-timing-function: var(--ease-spatial-fast);
}
@utility motion-spatial {
  transition-duration: var(--duration-spatial-default);
  transition-timing-function: var(--ease-spatial-default);
}
@utility motion-spatial-slow {
  transition-duration: var(--duration-spatial-slow);
  transition-timing-function: var(--ease-spatial-slow);
}
@utility motion-effects-fast {
  transition-duration: var(--duration-effects-fast);
  transition-timing-function: var(--ease-effects-fast);
}
@utility motion-effects {
  transition-duration: var(--duration-effects-default);
  transition-timing-function: var(--ease-effects-default);
}
@utility motion-effects-slow {
  transition-duration: var(--duration-effects-slow);
  transition-timing-function: var(--ease-effects-slow);
}

/* Cifras de contadores, series y cantidades. */
@utility tabular {
  font-variant-numeric: tabular-nums;
}

/* Color de sección: cualquier contenedor lo fija y sus hijos lo heredan. */
@layer base {
  [data-section="deporte"] {
    --accent: var(--color-primary);
    --on-accent: var(--color-on-primary);
    --accent-container: var(--color-primary-container);
    --on-accent-container: var(--color-on-primary-container);
    --accent-soft: var(--color-secondary-container);
    --on-accent-soft: var(--color-on-secondary-container);
  }
  [data-section="nutricion"] {
    --accent: var(--color-tertiary);
    --on-accent: var(--color-on-tertiary);
    --accent-container: var(--color-tertiary-container);
    --on-accent-container: var(--color-on-tertiary-container);
    --accent-soft: var(--color-tertiary-soft);
    --on-accent-soft: var(--color-on-tertiary-soft);
  }
  [data-section="hoy"] {
    --accent: var(--color-secondary);
    --on-accent: var(--color-on-secondary);
    --accent-container: var(--color-secondary-container);
    --on-accent-container: var(--color-on-secondary-container);
    --accent-soft: var(--color-secondary-container);
    --on-accent-soft: var(--color-on-secondary-container);
  }

  html {
    background: var(--color-surface);
    color-scheme: light;
  }
  body {
    background: var(--color-surface);
    color: var(--color-on-surface);
    font-family: var(--font-sans);
    font-optical-sizing: auto;
    /* Terminaciones redondeadas a medias: amable sin volverse infantil. */
    font-variation-settings: "ROND" 50;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Un solo anillo de foco para toda la app. */
  :where(
    a,
    button,
    input,
    select,
    textarea,
    summary,
    [tabindex]
  ):focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  ::selection {
    background: var(--accent-container);
    color: var(--on-accent-container);
  }
}

@layer components {
  /* --- Capa de estado M3 ------------------------------------------------- */
  /* Todo lo pulsable lleva `.state`: un velo de `currentColor` que sube a 8 %
     al pasar, 10 % con foco o al pulsar. La onda (`.ripple`) la pone
     components/ripple.ts solo con puntero. */
  .state {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    -webkit-tap-highlight-color: transparent;
  }
  .state::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background: currentColor;
    opacity: 0;
    border-radius: inherit;
    pointer-events: none;
    transition: opacity var(--duration-effects-fast) var(--ease-effects-fast);
  }
  .state:hover:not(:disabled, [aria-disabled="true"])::before {
    opacity: var(--state-hover);
  }
  .state:focus-visible::before {
    opacity: var(--state-focus);
  }
  .state:active:not(:disabled, [aria-disabled="true"])::before {
    opacity: var(--state-press);
  }
  .ripple {
    position: absolute;
    z-index: -1;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.12;
    transform: scale(0);
    pointer-events: none;
    animation: ripple var(--duration-effects-slow) var(--ease-emphasized)
      forwards;
  }

  /* --- Tarjetas: elevated / filled / outlined ---------------------------- */
  /* La jerarquía la marcan los tonos; la elevada es un tono más claro y una
     sombra mínima, no una difusa. */
  .card {
    border-radius: var(--radius-l);
    padding: var(--spacing-card);
    color: var(--color-on-surface);
  }
  .card-filled {
    --field-bg: var(--color-surface-container-highest);
    background: var(--color-surface-container-highest);
  }
  .card-elevated {
    --field-bg: var(--color-surface-container-low);
    background: var(--color-surface-container-low);
    box-shadow: var(--shadow-1);
  }
  .card-outlined {
    background: var(--color-surface);
    border: 1px solid var(--color-outline-variant);
  }
  .card-tonal {
    --field-bg: var(--color-surface-container);
    background: var(--color-surface-container);
  }

  /* Tarjeta que se pulsa: capa de estado + un levísimo muelle de escala. */
  .card-interactive {
    cursor: pointer;
    transition:
      transform var(--duration-spatial-fast) var(--ease-spatial-fast),
      border-radius var(--duration-spatial-fast) var(--ease-spatial-fast);
  }
  .card-interactive:active {
    transform: scale(0.98);
    border-radius: var(--radius-xl);
  }

  /* Etiqueta de sección (RECETA / FUERZA / NOTAS DEL DÍA) */
  .section-label {
    font-size: var(--text-label-m);
    line-height: var(--text-label-m--line-height);
    letter-spacing: 0.1em;
    font-weight: 700;
    font-stretch: 112%;
    text-transform: uppercase;
    color: var(--color-on-surface-variant);
  }

  /* Loader: tono surface-container que respira (sin barrido blanco, que en
     oscuro deslumbra). */
  .skeleton {
    background: var(--color-surface-container-high);
    border-radius: var(--radius-m);
    animation: breathe 1.4s var(--ease-emphasized) infinite alternate;
  }

  /* --- Botones M3E ------------------------------------------------------- */
  /* Redondos en reposo; al pulsar se cuadran (shape morph) con el muelle
     espacial rápido. El peso de la etiqueta también se mueve. */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: var(--radius-pill);
    font-weight: 600;
    font-stretch: 104%;
    line-height: 1;
    white-space: nowrap;
    user-select: none;
    transition:
      border-radius var(--duration-spatial-fast) var(--ease-spatial-fast),
      transform var(--duration-spatial-fast) var(--ease-spatial-fast),
      background-color var(--duration-effects-default)
      var(--ease-effects-default),
      color var(--duration-effects-default) var(--ease-effects-default),
      font-weight var(--duration-effects-default) var(--ease-effects-default),
      box-shadow var(--duration-effects-default) var(--ease-effects-default);
  }
  .btn:active:not(:disabled, [aria-disabled="true"]) {
    border-radius: var(--radius-m);
    font-weight: 700;
  }
  .btn[aria-pressed="true"] {
    border-radius: var(--radius-m);
  }
  .btn:disabled,
  .btn[aria-disabled="true"] {
    cursor: not-allowed;
    color: color-mix(in srgb, var(--color-on-surface) 38%, transparent);
    background-color: color-mix(
      in srgb,
      var(--color-on-surface) 10%,
      transparent
    );
    box-shadow: none;
    border-color: transparent;
  }
  .btn-filled {
    background: var(--accent);
    color: var(--on-accent);
  }
  .btn-tonal {
    background: var(--accent-soft);
    color: var(--on-accent-soft);
  }
  .btn-outlined {
    background: transparent;
    color: var(--color-on-surface-variant);
    border: 1px solid var(--color-outline-variant);
  }
  .btn-text {
    background: transparent;
    color: var(--accent);
  }
  .btn-danger {
    background: var(--color-error);
    color: var(--color-on-error);
  }
  .btn-outlined[aria-pressed="true"],
  .btn-text[aria-pressed="true"] {
    background: var(--accent-soft);
    color: var(--on-accent-soft);
    border-color: transparent;
  }

  /* FAB: el contenedor de la sección, con sombra (uno de los pocos elevados). */
  .fab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    background: var(--accent-container);
    color: var(--on-accent-container);
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-3);
    font-weight: 600;
    transition:
      border-radius var(--duration-spatial-default) var(--ease-spatial-default),
      transform var(--duration-spatial-fast) var(--ease-spatial-fast),
      box-shadow var(--duration-effects-default) var(--ease-effects-default);
  }
  .fab:hover {
    box-shadow: var(--shadow-3), var(--shadow-1);
  }
  .fab:active {
    transform: scale(0.94);
  }
  /* Abierto: se vuelve un círculo del color fuerte (se transforma). */
  .fab[aria-expanded="true"] {
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--on-accent);
  }

  /* --- Grupo de botones conectados (M3E) --------------------------------- */
  /* Piezas juntas con esquinas interiores pequeñas; la elegida se vuelve una
     píldora (cambia de forma) y la pulsada crece mientras sus vecinas ceden. */
  .connected {
    display: flex;
    gap: 2px;
  }
  /* Reposo de la pieza, sin especificidad (`:where`): cede ante la elegida y
     ante la piel de un `.btn` dentro del grupo (SplitButton). No va en
     utilidades de Tailwind: la capa `utilities` gana a `components`, y un
     `bg-*` en la pieza tapaba el acento de la elegida. */
  :where(.connected) > * {
    background: var(--color-surface-container-highest);
    color: var(--color-on-surface-variant);
  }
  .connected > * {
    flex: 1 1 auto;
    border-radius: var(--radius-s);
    transition:
      flex-grow var(--duration-spatial-fast) var(--ease-spatial-fast),
      border-radius var(--duration-spatial-fast) var(--ease-spatial-fast),
      background-color var(--duration-effects-default)
      var(--ease-effects-default),
      color var(--duration-effects-default) var(--ease-effects-default),
      font-weight var(--duration-effects-default) var(--ease-effects-default);
  }
  .connected > :first-child {
    border-start-start-radius: var(--radius-pill);
    border-end-start-radius: var(--radius-pill);
  }
  .connected > :last-child {
    border-start-end-radius: var(--radius-pill);
    border-end-end-radius: var(--radius-pill);
  }
  .connected > :active {
    flex-grow: 1.35;
  }
  .connected > [aria-pressed="true"],
  .connected > [aria-current="page"],
  .connected > [aria-selected="true"] {
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
  }

  /* --- Bloque encadenado (biserie, triserie, serie gigante) -------------- */
  /* Los ejercicios que se hacen encadenados van dentro de una caja con el tono
     claro del acento: su etiqueta y el tono bastan para ver de un tirón que van
     juntos (el borde de acento que llevó al principio sobraba). El tono es del
     bloque; las filas de dentro no lo repiten. */
  .chain {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.25rem;
    border-radius: var(--radius-l);
    background: var(--accent-soft);
  }
  .chain-label {
    padding-inline-start: 0.5rem;
    color: var(--on-accent-soft);
    font-size: var(--text-label-m);
    line-height: var(--text-label-m--line-height);
    letter-spacing: 0.1em;
    font-weight: 700;
    font-stretch: 112%;
    text-transform: uppercase;
  }
  /* Los miembros: lista sin viñetas ni márgenes (la caja los pone). Ocupa el
     alto del hueco que le da la pantalla (en la rejilla, las filas del bloque
     se reparten el alto de la columna). */
  .chain-rows {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* --- Chips ------------------------------------------------------------- */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
    padding: 0 1rem;
    border-radius: var(--radius-s);
    border: 1px solid var(--color-outline-variant);
    color: var(--color-on-surface-variant);
    font-size: var(--text-label-l);
    font-weight: 600;
    transition:
      border-radius var(--duration-spatial-fast) var(--ease-spatial-fast),
      background-color var(--duration-effects-default)
      var(--ease-effects-default),
      color var(--duration-effects-default) var(--ease-effects-default);
  }
  .chip[aria-pressed="true"],
  .chip[aria-current="page"] {
    border-color: transparent;
    border-radius: var(--radius-l);
    background: var(--accent-soft);
    color: var(--on-accent-soft);
  }
  /* Área táctil de 48 px aunque el chip mida 32 (M3). */
  .chip::after {
    content: "";
    position: absolute;
    inset: -8px 0;
  }

  /* --- Tira con scroll (`ScrollStrip`) ---------------------------------- */
  /* Una sola línea que nunca envuelve: encoge y desplaza. Cuando queda
     contenido fuera, el borde correspondiente se desvanece — es el indicador
     de que hay más de lo que cabe; la barra no se pinta. */
  .scroll-x {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .scroll-x::-webkit-scrollbar {
    display: none;
  }
  .scroll-x[data-edge="end"] {
    -webkit-mask-image: linear-gradient(
      to right,
      #000 calc(100% - 28px),
      transparent
    );
    mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
  }
  .scroll-x[data-edge="start"] {
    -webkit-mask-image: linear-gradient(
      to left,
      #000 calc(100% - 28px),
      transparent
    );
    mask-image: linear-gradient(to left, #000 calc(100% - 28px), transparent);
  }
  .scroll-x[data-edge="both"] {
    -webkit-mask-image: linear-gradient(
      to right,
      transparent,
      #000 28px,
      #000 calc(100% - 28px),
      transparent
    );
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 28px,
      #000 calc(100% - 28px),
      transparent
    );
  }

  /* --- Campos: outlined con etiqueta flotante --------------------------- */
  /* Elegido outlined (no filled) para toda la app: sobre superficies tonales
     un campo relleno se funde con la tarjeta. La etiqueta flota cuando hay
     foco o valor (`:placeholder-shown` con un placeholder de un espacio). */
  .input {
    min-width: 0;
    width: 100%;
    background: transparent;
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-xs);
    padding: 0.75rem 1rem;
    min-height: 3rem;
    color: var(--color-on-surface);
    font-size: var(--text-body-l);
    transition:
      border-color var(--duration-effects-fast) var(--ease-effects-fast),
      box-shadow var(--duration-effects-fast) var(--ease-effects-fast);
  }
  .input::placeholder {
    color: var(--color-on-surface-variant);
  }
  .input:hover:not(:disabled, :focus) {
    border-color: var(--color-on-surface);
  }
  .input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .input[aria-invalid="true"] {
    border-color: var(--color-error);
  }
  .input[aria-invalid="true"]:focus {
    box-shadow: inset 0 0 0 1px var(--color-error);
  }
  .input:disabled {
    opacity: 0.38;
  }

  .field {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .field-label {
    position: absolute;
    left: 0.75rem;
    top: 0.75rem;
    padding: 0 0.25rem;
    max-width: calc(100% - 1.5rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-on-surface-variant);
    font-size: var(--text-body-l);
    line-height: 1.5rem;
    pointer-events: none;
    background: var(--field-bg, var(--color-surface));
    transform-origin: left center;
    transition:
      transform var(--duration-spatial-fast) var(--ease-spatial-fast),
      color var(--duration-effects-fast) var(--ease-effects-fast);
  }
  .field:focus-within .field-label,
  .field .input:not(:placeholder-shown) ~ .field-label,
  .field select.input ~ .field-label,
  .field .input[type="date"] ~ .field-label,
  .field .input[type="file"] ~ .field-label {
    transform: translateY(-1.45rem) scale(0.75);
  }
  .field:focus-within .field-label {
    color: var(--accent);
  }
  .field:has([aria-invalid="true"]) .field-label,
  .field-error {
    color: var(--color-error);
  }
  .field-support,
  .field-error {
    padding: 0 1rem;
    font-size: var(--text-body-s);
    line-height: var(--text-body-s--line-height);
  }
  .field-support {
    color: var(--color-on-surface-variant);
  }

  /* --- Casilla y switch -------------------------------------------------- */
  .checkbox {
    appearance: none;
    flex-shrink: 0;
    width: 1.125rem;
    height: 1.125rem;
    border: 2px solid var(--color-on-surface-variant);
    border-radius: 2px;
    display: grid;
    place-content: center;
    cursor: pointer;
    transition:
      background-color var(--duration-effects-fast) var(--ease-effects-fast),
      border-color var(--duration-effects-fast) var(--ease-effects-fast);
  }
  .checkbox::after {
    content: "";
    width: 0.625rem;
    height: 0.3125rem;
    border-left: 2px solid var(--on-accent);
    border-bottom: 2px solid var(--on-accent);
    transform: translateY(-1px) rotate(-45deg) scale(0);
    transition: transform var(--duration-spatial-fast) var(--ease-spatial-fast);
  }
  .checkbox:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .checkbox:checked::after {
    transform: translateY(-1px) rotate(-45deg) scale(1);
  }
  .checkbox[aria-invalid="true"] {
    border-color: var(--color-error);
  }
  .checkbox:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }
  /* 48 px de área táctil alrededor de una casilla de 18. */
  .checkbox-target {
    display: inline-grid;
    place-items: center;
    min-width: 3rem;
    min-height: 3rem;
    border-radius: var(--radius-full);
    color: var(--accent);
  }

  .switch {
    appearance: none;
    flex-shrink: 0;
    width: 3.25rem;
    height: 2rem;
    border-radius: var(--radius-full);
    background: var(--color-surface-container-highest);
    border: 2px solid var(--color-outline);
    position: relative;
    cursor: pointer;
    transition:
      background-color var(--duration-effects-default)
      var(--ease-effects-default),
      border-color var(--duration-effects-default) var(--ease-effects-default);
  }
  .switch::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 0.375rem;
    width: 1rem;
    height: 1rem;
    border-radius: var(--radius-full);
    background: var(--color-outline);
    transform: translateY(-50%);
    transition:
      left var(--duration-spatial-fast) var(--ease-spatial-fast),
      width var(--duration-spatial-fast) var(--ease-spatial-fast),
      height var(--duration-spatial-fast) var(--ease-spatial-fast),
      background-color var(--duration-effects-default)
      var(--ease-effects-default);
  }
  .switch:active::after {
    width: 1.75rem;
    height: 1.75rem;
  }
  .switch:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .switch:checked::after {
    left: calc(100% - 1.625rem);
    width: 1.5rem;
    height: 1.5rem;
    background: var(--on-accent);
  }

  /* --- Insignias --------------------------------------------------------- */
  :where(.badge-pending, .badge-done, .badge-neutral, .badge-accent) {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border-radius: var(--radius-full);
    font-size: var(--text-label-m);
    line-height: var(--text-label-m--line-height);
    font-weight: 700;
    font-stretch: 110%;
    padding: 0.25rem 0.625rem;
  }
  .badge-pending {
    background: var(--color-tertiary-container);
    color: var(--color-on-tertiary-container);
  }
  .badge-done {
    background: var(--color-primary-container);
    color: var(--color-on-primary-container);
  }
  .badge-neutral {
    background: var(--color-surface-container-highest);
    color: var(--color-on-surface-variant);
  }
  .badge-accent {
    background: var(--accent-container);
    color: var(--on-accent-container);
  }

  /* --- Avisos ------------------------------------------------------------ */
  .alert {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    border-radius: var(--radius-l);
    padding: 1rem;
  }
  .alert-error {
    background: var(--color-error-container);
    color: var(--color-on-error-container);
  }
  .alert-info {
    background: var(--accent-soft);
    color: var(--on-accent-soft);
  }

  /* --- Fila de lista ----------------------------------------------------- */
  .list-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-stack);
    border-radius: var(--radius-m);
  }

  /* --- Superficies superpuestas ------------------------------------------ */
  .scrim {
    background: color-mix(in srgb, var(--color-scrim) 40%, transparent);
    animation: fade-in var(--duration-effects-default)
      var(--ease-effects-default) backwards;
  }
  /* Cada superficie declara su `--field-bg`: la etiqueta flotante de un campo
     outlined tapa el borde con el color de lo que tiene debajo. */
  .dialog {
    --field-bg: var(--color-surface-container-high);
    background: var(--color-surface-container-high);
    color: var(--color-on-surface);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-3);
    animation: dialog-in var(--duration-spatial-default)
      var(--ease-spatial-default) backwards;
  }
  /* Hoja inferior: esquinas grandes arriba, planas abajo (asimetría M3). */
  .sheet {
    --field-bg: var(--color-surface-container-low);
    background: var(--color-surface-container-low);
    color: var(--color-on-surface);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    box-shadow: var(--shadow-3);
    animation: sheet-in var(--duration-spatial-default)
      var(--ease-spatial-default) backwards;
    transition: transform var(--duration-spatial-fast) var(--ease-spatial-fast);
  }
  .sheet-handle {
    width: 2rem;
    height: 0.25rem;
    border-radius: var(--radius-full);
    background: var(--color-on-surface-variant);
    opacity: 0.4;
  }
  .menu {
    --field-bg: var(--color-surface-container);
    background: var(--color-surface-container);
    color: var(--color-on-surface);
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-2);
    animation: menu-in var(--duration-spatial-fast) var(--ease-spatial-fast)
      backwards;
    transform-origin: top left;
  }
  /* Tooltip enriquecido M3: contenedor de superficie, forma M, elevación 2 (es
     una superficie flotante como el menú). Solo lo pinta `useTooltip`. */
  .tooltip {
    background: var(--color-surface-container);
    color: var(--color-on-surface);
    border-radius: var(--radius-m);
    box-shadow: var(--shadow-2);
    animation: fade-in var(--duration-effects-fast) var(--ease-effects-fast)
      backwards;
  }
  .toolbar {
    background: var(--color-surface-container-high);
    color: var(--color-on-surface);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-3);
    animation: toolbar-in var(--duration-spatial-default)
      var(--ease-spatial-default) backwards;
  }
  .snackbar {
    background: var(--color-inverse-surface);
    color: var(--color-inverse-on-surface);
    border-radius: var(--radius-s);
    box-shadow: var(--shadow-3);
    animation: snackbar-in var(--duration-spatial-default)
      var(--ease-spatial-default) backwards;
  }
  .snackbar-action {
    color: var(--color-inverse-primary);
  }
  .search-view {
    background: var(--color-surface-container-high);
    color: var(--color-on-surface);
    box-shadow: var(--shadow-3);
    animation: dialog-in var(--duration-spatial-default)
      var(--ease-spatial-default) backwards;
  }
}

/* --- Entrada escalonada ------------------------------------------------ */
/* NUNCA en una lista ordenable (dnd-kit mide las filas al empezar a
   arrastrar: una fila a media entrada está desplazada y el orden sale mal).
   Los hijos directos de `.stagger` entran con el muelle espacial por turno
   (`--i` lo pone la pantalla; sin él entran juntos). */
/* `backwards`, no `both`: al acabar, la animación suelta `transform`. Con
   `both` retenía el último fotograma y pisaba el transform en línea de dnd-kit
   (las listas ordenables no se movían al arrastrar). */
.stagger > * {
  animation: rise var(--duration-spatial-default) var(--ease-spatial-default)
    backwards;
  animation-delay: calc(min(var(--i, 0), 8) * 40ms);
}
.animate-rise {
  animation: rise var(--duration-spatial-default) var(--ease-spatial-default)
    backwards;
}
.animate-pop {
  animation: pop var(--duration-spatial-fast) var(--ease-spatial-fast) backwards;
}

/* Tipografía que se mueve: la etiqueta activa gana peso y anchura. */
.type-move {
  transition:
    font-weight var(--duration-spatial-fast) var(--ease-spatial-fast),
    font-stretch var(--duration-spatial-fast) var(--ease-spatial-fast);
}

/* --- Formas M3E animadas ------------------------------------------------ */
/* El morph interpola el `d` del <path> (mismo número de puntos en todas las
   formas; ver lib/shapes.ts). */
.shape path {
  transition: d var(--duration-spatial-default) var(--ease-spatial-default);
}
.shape-spin {
  animation: spin 2.4s linear infinite;
}

/* Indicador de carga M3E: una forma que gira y cambia (la secuencia la
   pone el componente; aquí solo el giro). */
.loader path {
  transition: d 420ms var(--ease-spatial-fast);
}

/* Progreso ondulado: la onda se desplaza sola. */
.wavy-track {
  animation: wave-drift 1.2s linear infinite;
}
.wavy-fill {
  transition: stroke-dashoffset var(--duration-spatial-slow)
    var(--ease-spatial-slow);
}

/* Sello de recompensa: entra con el muelle espacial lento (rebota). */
.seal {
  animation: seal-in var(--duration-spatial-slow) var(--ease-spatial-slow)
    backwards;
}
.seal-shape {
  animation: spin 18s linear infinite;
  transform-origin: center;
}

/* --- Transiciones de vista (router de datos) ---------------------------- */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: var(--duration-effects-default);
  animation-timing-function: var(--ease-effects-default);
}
/* Transformación de contenedor: la tarjeta de receta crece hasta la cabecera
   (mismo `view-transition-name` en las dos). */
::view-transition-group(*) {
  animation-duration: var(--duration-spatial-default);
  animation-timing-function: var(--ease-spatial-default);
}
/* Crear: lo pulsado (FAB, «Nueva …») crece hasta lo que abre con el muelle
   espacial; el contenido cambia por fundido cruzado sin estirarse. */
::view-transition-old(create),
::view-transition-new(create) {
  height: 100%;
  object-fit: cover;
  overflow: clip;
}
/* Lo pulsado se desvanece pronto: no se ve estirado mientras crece. */
::view-transition-old(create) {
  animation-duration: var(--duration-effects-fast);
}
/* Día → modal: mismo trato que «crear» — el contenido llena el contenedor y la
   columna de origen (alta y estrecha) se despide pronto; si no, se queda
   estirada encima del modal todo lo que dura la expansión. */
::view-transition-old(day-sheet),
::view-transition-new(day-sheet) {
  height: 100%;
  object-fit: cover;
  overflow: clip;
}
::view-transition-old(day-sheet) {
  animation-duration: var(--duration-effects-fast);
}
/* Eje compartido X al cambiar de semana: sale hacia un lado, entra del otro. */
::view-transition-old(week-grid) {
  animation: axis-out var(--duration-spatial-fast) var(--ease-emphasized) both;
}
::view-transition-new(week-grid) {
  animation: axis-in var(--duration-spatial-default) var(--ease-spatial-default)
    both;
}
:root[data-week-dir="prev"]::view-transition-old(week-grid) {
  animation-name: axis-out-prev;
}
:root[data-week-dir="prev"]::view-transition-new(week-grid) {
  animation-name: axis-in-prev;
}

/* Las entradas animan `translate`/`scale`/`rotate` sueltos, no `transform`:
   así no pisan el `transform` en línea de dnd-kit (listas ordenables) ni el del
   arrastre de la hoja. */
@keyframes ripple {
  to {
    transform: scale(1);
    opacity: 0;
  }
}
@keyframes breathe {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.55;
  }
}
@keyframes rise {
  from {
    opacity: 0;
    translate: 0 12px;
  }
}
@keyframes pop {
  from {
    opacity: 0;
    scale: 0.9;
  }
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
}
@keyframes dialog-in {
  from {
    opacity: 0;
    translate: 0 24px;
    scale: 0.96;
  }
}
@keyframes sheet-in {
  from {
    translate: 0 100%;
  }
}
@keyframes menu-in {
  from {
    opacity: 0;
    scale: 0.85;
  }
}
@keyframes toolbar-in {
  from {
    opacity: 0;
    translate: 0 24px;
    scale: 0.9;
  }
}
@keyframes snackbar-in {
  from {
    opacity: 0;
    translate: 0 16px;
    scale: 1 0.6;
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes wave-drift {
  to {
    transform: translateX(var(--wave-length, -24px));
  }
}
@keyframes seal-in {
  from {
    opacity: 0;
    scale: 0.2;
    rotate: -40deg;
  }
}
@keyframes axis-out {
  to {
    opacity: 0;
    transform: translateX(-48px);
  }
}
@keyframes axis-in {
  from {
    opacity: 0;
    transform: translateX(48px);
  }
}
@keyframes axis-out-prev {
  to {
    opacity: 0;
    transform: translateX(48px);
  }
}
@keyframes axis-in-prev {
  from {
    opacity: 0;
    transform: translateX(-48px);
  }
}

/* Movimiento reducido: nada rebota ni cambia de forma animado; lo que entra
   o cambia de estado lo hace con un fundido corto. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    animation-delay: 0ms !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
  .scrim,
  .dialog,
  .sheet,
  .menu,
  .tooltip,
  .toolbar,
  .snackbar,
  .search-view,
  .seal,
  .stagger > *,
  .animate-rise,
  .animate-pop {
    animation: fade-in 150ms linear backwards !important;
  }
  .shape-spin,
  .seal-shape,
  .wavy-track {
    animation: none !important;
  }
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```

---

## Anexo C — `theme.js` (sin destello, en el `<head>` antes del primer pintado)

```js
// Tema antes del primer pintado (script clásico, sin defer, en <head>): la
// página sale ya en su tema aunque el bundle tarde o no llegue. Espejo de
// `THEME_KEY` y `resolveTheme` en src/lib/theme.ts (el test los ata): si cambia
// la regla o la clave, cambian los dos.
(() => {
  let saved = null;
  try {
    saved = localStorage.getItem("esencial.theme");
  } catch {
    // almacenamiento bloqueado: manda el sistema
  }
  const chosen = saved === "light" || saved === "dark";
  const dark =
    !chosen && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = chosen
    ? saved
    : dark
      ? "dark"
      : "light";
})();
```

Cambia la clave de `localStorage` por la del proyecto nuevo y ata la regla del
script con la de `useTheme` con un test (si divergen, el tema salta al hidratar).
