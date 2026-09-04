# Exploration — CM2: zona de gestión dinámica (project-site/)

> Artefacto de la fase sdd-explore. Change: `2026-09-03-cm2-zona-gestion-dinamica`.

## Current State

`project-site/` es un sitio estático standalone (file:// o cualquier host estático), desacoplado
del deploy de la app. Confirmado: `wrangler.toml [assets] directory = ./web/dist`;
`package.json` raíz — `build`/`test` solo apuntan a `web`+`api`; project-site nunca se construye
ni empaqueta.

Render 100% client-side: `index.html` carga `data.js` (define `window.TREE`, 333 líneas) y luego
`app.js`. `app.js` recorre `TREE` recursivamente hacia nodos `<details>/<summary>`, pintando
badge `status`, `notes` (`{kind, text}`) y `children` anidados. Forma de nodo:
`{ title, status?: decidido|descartado|pendiente|activo, open?: bool, notes?: [{kind,text}], children?: [...] }`.
`KINDS` = `{decidido, descartado, pendiente, nota}`. `#updated` desde `TREE.updated`.

Hoy el contenido solo se edita a mano tocando `data.js`; el navegador es de solo lectura.
OpenSpec `config.yaml`: strict_tdd true, unit=vitest; project-site NO tiene tests hoy.

## Affected Areas

- `project-site/index.html` — añadir `<script src="entries.js">` tras data.js; affordance de
  añadir entrada/anotación y control de guardado.
- `project-site/app.js` — extender renderer para fusionar `window.ENTRIES` (indexado por
  `title` de nodo); lógica del form; guardado FSA (`showOpenFilePicker`/`createWritable`) +
  fallback descarga.
- `project-site/data.js` — SIN CAMBIOS; árbol base inmutable, referencia read-only de títulos.
- `project-site/entries.js` (NUEVO) — script plano `window.ENTRIES`, junto a data.js,
  git-versionado, editable a mano.
- `project-site/entries-lib.js` (NUEVO, probable) — funciones puras testables (merge +
  serializar) con guard `module.exports` para `node --test`; navegador vía `window`.
- `project-site/entries-lib.test.js` (NUEVO, probable) — unit tests `node --test` (stdlib).

## Approaches

1. **Elegido (locked por el usuario): `entries.js` (`window.ENTRIES`) + File System Access API
   + fallback descarga** — 100% client-side. `app.js` fusiona ENTRIES sobre TREE y ofrece form
   de añadir; primer guardado → `showOpenFilePicker()` (handle cacheado por sesión); siguientes
   → `createWritable()`. Sin FSA (Firefox/Safari) → Blob+`<a download>`.
   - Pros: cumple las 5 constraints; sin build/server/deploy; git-versionado; diff mínimo;
     funciona en file:// (scripts clásicos, sin CORS/fetch de JSON local).
   - Cons: FSA solo Chromium → fallback obligatorio; un pick por sesión; el sobrescrito
     navegador descarta formato manual de entries.js (ceiling); claves por `title` exigen
     títulos únicos.
   - Esfuerzo: Bajo–Medio.
2. Descartado: `fetch` de `.json` crudo (bloqueado en file://; viola el patrón data.js).
3. Descartado: `localStorage` (no git-versionado, no editable a mano).
4. Descartado: servidor/API/D1 o escritura en el deploy (viola constraints 1 y 2).

## Recommendation

Adoptar el Approach 1. Lógica pura (merge + serialize) en `entries-lib.js` con guard
`module.exports`; glue de navegador/FSA en `app.js`. Un único fichero `entries.js` para los
datos dinámicos; `data.js` inmutable. Cambio solo-client, independiente, de bajo riesgo.

## Risks

- **Unicidad de `title`**: entradas referenciadas por título (ceiling confirmado). Colisión si
  dos nodos comparten título. Mitigar: documentar ceiling; aviso opcional en el form.
- **Hand-edit vs sobrescrito**: la escritura del navegador reemplaza el fichero completo;
  ediciones manuales posteriores se pierden. Ceiling a documentar.
- **Disponibilidad FSA**: requiere Chromium y contexto seguro; Firefox/Safari → fallback de
  descarga robusto y re-pick por sesión.
- **Pick de fichero equivocado**: mitigar con etiquetado claro y `suggestedName`.
- **Deriva de testing**: strict_tdd/vitest es de la app; project-site usa `node --test`
  stdlib como workaround confirmado; tests separados de `npm test`.

## Ready for Proposal

**Sí.** Pendiente a nivel de spec: forma exacta de `ENTRIES` (mapa por title vs. lista plana
con `nodeTitle`), semántica de kind/fecha opcional, y ceiling de unicidad de títulos.
