# UI-LAB-REPORT — Variante A: acabado sistémico

Rama `ifmael/ui-acabado`. Sin cambios fuera de `web/` y `e2e/` (una línea de un
test, ver §6). Funcionalidad, rutas, endpoints y datos intactos: **esto es un
rediseño de forma**.

---

## 1. Qué cambia, en una frase

La app no tenía sistema: cada pantalla elegía sus tamaños, sus radios y sus
sombras a mano, y no había **una sola transición** en todo el CSS. Ahora hay una
capa de tokens en `web/src/globals.css`, primitivas en `web/src/components/ui.tsx`
y el acabado aplicado al shell y a la pantalla Hoy.

## 2. Decisiones de sistema

### Escala tipográfica

Antes: `text-sm`(14) / `text-lg`(18) / `text-xl`(20) / `text-2xl`(24) mezclados sin
criterio, más `text-base`(16) por defecto. Ahora seis pasos con line-height pareja:

| token | px | para qué |
|---|---|---|
| `text-micro` | 11 | etiquetas de sección y badges, en mayúsculas y con tracking |
| `text-caption` | 13 | metadatos y ayudas |
| `text-body` | 15 | texto de interfaz |
| `text-lead` | 17 | el dato principal de una fila (nombre de receta, de sesión) |
| `text-title` | 20 | título de bloque, y título de pantalla en móvil |
| `text-display` | 24 | título de pantalla en escritorio |

Los títulos llevan `letter-spacing: -0.02em`; el título de fecha usa
`first-letter:uppercase` en lugar de `capitalize` (antes producía «19 De
Septiembre»; ahora «19 de septiembre»).

### Ritmo de espaciado

Base 4px de Tailwind + cuatro tokens semánticos, que es lo que se usa en la
práctica:

| token | px | para qué |
|---|---|---|
| `gap-stack` | 12 | entre elementos de un mismo bloque |
| `gap-x-gutter` | 16 | entre columnas |
| `p-card` | 20 | padding interno de tarjeta |
| `gap-y-section` | 28 | entre secciones de la página |

Escalera de 8→12→20→28: cada salto es un cambio de nivel, no un número suelto.

### Radios

Antes: 8px en controles, 12px en tarjetas, `rounded-lg` suelto por ahí.
Ahora una escala de tres pasos + pastilla: `control` 10px (botones, campos,
botones-icono), `panel` 12px (bloques dentro de una tarjeta), `card` 16px
(superficies), `chip` 999px. **12px→16px en tarjeta es deliberado**: la maqueta
de Stitch renderiza las tarjetas a ~16-20px y `DESIGN.md` (12px) es el documento
que la propia maqueta superó.

### Superficies y elevación

Antes una sola sombra plana (`0 1px 3px rgba(0,0,0,.08)`) en todo. Ahora dos
sombras compuestas (`--shadow-card`, `--shadow-raised`) + `--shadow-inset`, y
cuatro colores derivados que antes no existían: `--color-primary-soft` (pastilla
del menú activo), `--color-primary-soft-strong`, `--color-border-strong` y
`--color-ring`.

### Movimiento

Antes: cero transiciones. Ahora tres duraciones (120/180/280ms) y **un solo
easing** para todo lo que reacciona al usuario, `cubic-bezier(.22,1,.36,1)`:

- **hover** de controles y filas: 120ms sobre fondo/borde/color;
- **pulsado**: los botones bajan 1px; las tarjetas interactivas suben 1px al pasar
  por encima y vuelven al pulsar;
- **chevron** del submenú: gira 180° en 200ms (el panel aparece/desaparece, no se
  anima la altura: animar `height` es caro y se ve peor);
- **entrada** de la página: `rise` de 280ms, escalonada 0/60/120ms por columna;
- **carga**: barrido `shimmer` en lugar del `animate-pulse` de opacidad;
- `@media (prefers-reduced-motion: reduce)` neutraliza todo lo anterior.

Detalle deliberado: el hover de los botones oscurece con una capa
(`background-image`) en vez de fijar un color. Así sigue funcionando cuando una
pantalla pinta el botón de otro color (`btn-primary bg-error` existe en
`/sesion`), sin volverse verde al pasar por encima.

### Estados

Un único anillo de foco para toda la app (`:focus-visible`, 2px verde + 2px de
offset), `disabled` al 50% con `cursor: not-allowed`, y campos en error por
`aria-invalid` — que es a la vez el gancho de estilo y lo que anuncia el lector
de pantalla, así que no hay estado duplicado en una clase aparte.

## 3. Primitivas — `web/src/components/ui.tsx`

`Button` (primary/secondary/ghost × sm/md/icon, con `type="button"` por defecto
para que no envíe formularios sin querer), `Card`, `Input`, `Textarea`, `Badge`
(pending/done/neutral). Los iconos viven en `web/src/components/icons.tsx`: diez
formas de trazo, sin librería.

**Por qué la piel está en CSS y las primitivas son finas:** de las 11 pantallas,
9 no entran en esta iteración. Todas usan ya `.card`, `.btn-primary`,
`.btn-secondary`, `.input`, `.badge-pending`, `.badge-done`. Poniendo el acabado
en esas clases, esas 9 pantallas mejoran **sin tocarlas**; las primitivas solo
añaden el contrato de React (variantes, tonos, `type`). Es la vía con menos
código para el mismo resultado, y deja la puerta abierta a migrarlas pantalla a
pantalla cuando les toque.

## 4. Shell

Estructura intacta: 3 secciones, mismos submenús colapsables, mismos destinos,
mismos `aria-expanded`/`aria-controls`/`aria-current`.

- **Breakpoint de navegación: `md`(768) → `lg`(1024).** Antes, entre 768 y 1023
  convivían la barra lateral de 224px **y** la barra inferior, con la rejilla de
  3 columnas comprimida en el hueco. `DESIGN.md` fija justo ahí el salto
  tableta→escritorio.
- **Contenido centrado y con tope**: `mx-auto max-w-6xl` (1200px, lo que dice
  `DESIGN.md`). Antes se estiraba de borde a borde.
- **Barra lateral**: bloque de marca (marca + «Esencial» + «Bienestar personal»),
  filas de 44px con icono, activo como pastilla verde suave, submenús con raíl
  vertical y chevron que gira, y «Cerrar sesión» anclado abajo.
- **Barra inferior**: icono + etiqueta, objetivo táctil de 44px, pastilla de
  activo tras el icono, `padding` de *safe-area*, sombra superior para
  despegarla del contenido y «Salir» separado por una línea.

## 5. Pantalla Hoy

Mismo número de bloques, mismo orden y misma rejilla de 3 columnas.

- **Cabecera**: el título abre en el mismo borde izquierdo que la rejilla (los
  chevrones pasaron detrás del título; antes el primer bloque visible era un
  botón de 44px y el texto quedaba 52px metido hacia dentro). «Hoy» y el selector
  de fecha comparten **una sola caja**, así que hay una sola affordance de
  calendario en vez de dos. Los dos enlaces rápidos son ahora chips con borde.
- **Secciones**: etiquetas en micro-mayúsculas, tarjetas de 16px, filas de receta
  con miniatura de 56px, subida al hover y chevron que se desplaza, estados
  vacíos con la misma altura mínima, lista de ejercicios en panel hundido con
  círculos numerados, línea «N ejercicios · N series» leída de los datos reales
  (`targetSets`) y CTA a ancho completo.
- **Notas**: textarea sobre superficie hundida y fila de estado con icono
  (`Autoguardado` / `Guardando…` / `Guardado` / `No guardado` + reintento).
- **Rejilla**: 3 columnas en `lg`, 1 por debajo; gutter 16px, ritmo vertical 28px.

## 6. Lo que queda fuera, y por qué

1. **Las otras 9 pantallas.** Heredan la capa de sistema (y se nota), pero su
   maquetación interna no se ha rediseñado. Es el siguiente trabajo.
2. **La estructura de las pantallas.** Columnas, orden de bloques y número de
   bloques quedan congelados a propósito: es lo que permite comparar A con B. Por
   eso no he tocado el reparto desigual de alturas de las 3 columnas ni el vacío
   inferior en escritorio — la maqueta de Stitch hace exactamente lo mismo.
3. **El formato de la fecha en el `<input type="date">`.** Lo formatea el
   navegador según *su* idioma, no el de la página: un Chrome en inglés enseña
   `09/19/2026` mientras el título dice «19 de septiembre». Arreglarlo de verdad
   es un selector propio (Popover + calendario), y eso ya es cambiar el
   comportamiento. La página es `lang="es"`.
4. **shadcn/Base UI** para Dialog, Select, Combobox, Popover y Tabs: Hoy no usa
   ninguna de esas piezas, así que no se ha instalado nada. Entra cuando la
   iteración toque una pantalla con diálogo.
5. **Tema oscuro.** No existe paleta oscura en `DESIGN.md`; no se inventa.
6. **El vacío entre «Autoguardado» y el texto** en la tarjeta de notas: es el
   textarea, que es alto a propósito.

### Un test de e2e tocado

`e2e/tests/edge.spec.ts:98` esperaba `getByText("Guardado")`, que en Playwright
es *subcadena*: con la etiqueta de reposo `Autoguardado` (que viene de la
maqueta) la aserción pasaba nada más cargar, antes de que el autosave guardara.
Ahora es `{ exact: true }`, que es lo que el test quería decir desde el principio.

## 7. Cómo verificarlo

```bash
# 0. deps
pnpm install

# 1. base local (nace con 91 ejercicios y NADA más)
pnpm db:migrate:local < /dev/null

# 2. los dos Workers: frontal 8787, API 8789
pnpm dev
```

Abre <http://127.0.0.1:8787> (en dev la identidad la simula `[access.dev]`).
**Sin datos solo verás los estados vacíos** (que es un estado que merece la pena
mirar). Para ver la pantalla llena, pega esto en la consola del navegador con la
app abierta:

> Nota: los dos workers se quedan **levantados** en 8787 (frontal) y 8789 (API)
> para comparar esta variante con la otra sin volver a arrancar nada.

```js
const API = "http://127.0.0.1:8789", DATE = "2026-09-19"; // hoy, en tu fecha
const j = (u, o) => fetch(API + u, { credentials: "include", ...o })
  .then(async r => ({ s: r.status, b: await r.json().catch(() => null) }));
const isoWeek = (await j("/api/day/" + DATE)).b.isoWeek;
const dayIndex = (await j("/api/day/" + DATE)).b.dayIndex;

// fotos de relleno (canvas -> JPEG -> POST /api/uploads)
const photo = async (h) => {
  const c = Object.assign(document.createElement("canvas"), { width: 512, height: 512 });
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, `hsl(${h} 55% 62%)`); grad.addColorStop(1, `hsl(${(h + 40) % 360} 45% 34%)`);
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  const blob = await new Promise(b => c.toBlob(b, "image/jpeg", 0.85));
  const fd = new FormData(); fd.append("file", blob, "f.jpg");
  return (await j("/api/uploads", { method: "POST", body: fd })).b.photo_path;
};
const recipes = [
  ["Avena con frutos rojos", "desayuno", 16],
  ["Ensalada de pollo y quinoa", "almuerzo", 96],
  ["Salmón al horno con verduras", "cena", 208],
];
const ids = [];
for (const [name, , hue] of recipes) {
  ids.push((await j("/api/recipes", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, photo_path: await photo(hue), servings: 2 }),
  })).b.id);
}
await j("/api/meal-plan/" + isoWeek, {
  method: "PUT", headers: { "content-type": "application/json" },
  body: JSON.stringify({ slots: recipes.map(([, meal], i) => ({ day: dayIndex, meal, recipeId: ids[i] })) }),
});
await j("/api/plan-sessions", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ date: DATE, name: "Empuje A", items: [
    { exerciseId: 1, targetSets: 4 }, { exerciseId: 24, targetSets: 3 },
    { exerciseId: 6, targetSets: 3 }, { exerciseId: 46, targetSets: 3 },
  ]}),
});
await j("/api/notes/" + DATE, {
  method: "PUT", headers: { "content-type": "application/json" },
  body: JSON.stringify({ text: "Dormí bien. Sesión de empuje por la tarde." }),
});
location.reload();
```

Qué mirar, en 2 minutos:

1. **Escritorio ≥1024px**: menú lateral; pasa el ratón por una fila de la barra
   lateral, por una tarjeta de receta y por «Registrar sesión» → hay transición,
   la fila de receta se levanta y el chevron se mueve. Tabula → anillo verde.
2. **Móvil ~390px**: barra inferior con pastilla de activo, contenido que no
   queda tapado al llegar al fondo, `padding` de safe-area.
3. **Menú**: expande Deporte → el chevron gira, aparece el raíl del submenú.
4. **Notas**: escribe → «Guardando…» → «Guardado»; con el servidor parado,
   «No guardado» + reintento.

### Comandos de la puerta

```bash
pnpm test        # api 202 + web 212, en verde
pnpm typecheck   # los 4 paquetes, limpio
pnpm lint        # 0 errores (mismas advertencias que en main)
pnpm e2e         # 30 pasan
```

## 8. Qué he comprobado yo (no lo que creo)

- `pnpm test` → **api 202/202, web 212/212** (los 212 incluyen 9 nuevos en
  `web/tests/ui-primitives.test.tsx`).
- `pnpm typecheck` → limpio en api, web y e2e.
- `pnpm lint` → **0 errores**; línea base comparada contra `HEAD` en un worktree
  aparte (`biome check .` daba 0 errores antes y da 0 ahora).
- `pnpm e2e` → **30 pasan** (29 + el de autosave corregido) en 8788/8790. Tuve
  que arreglar la aserción laxa del test de autosave (§6).
- **Chromium real**, 1440×950 y 390×844, con datos de hoy:
  - los tokens nuevos compilan a utilidades de verdad (`.gap-y-section`,
    `.text-lead`, `.ease-out-quart`, `.first-letter\:uppercase`,
    `.pb-[env(safe-area-inset-bottom)]`);
  - el título y la rejilla comparten borde izquierdo: **x=304** en los dos;
  - las tres filas del menú ocupan el mismo cajón (16→239) con la pastilla de
    activo puesta, tenga o no botón de desplegar a su derecha;
  - el icono de «Día siguiente» y el chevron de «Plan fuerza» acaban a 1px de
    distancia (1381 vs 1382);
  - el anillo de foco se asienta en `rgb(21, 128, 61)`, 2px con 2px de offset;
  - al fondo del scroll en móvil, el último elemento acaba en y=717.8 y la barra
    inferior empieza en y=769 → **51px de holgura**, nada tapado;
  - el `<input type="date">` medía 44px dentro de una caja de 36px (`min-height`
    heredado de `.input`); corregido con `min-h-0` y verificado a 32px.
- Estados vacíos y de error revisados en navegador (día sin comidas, sin sesión).
