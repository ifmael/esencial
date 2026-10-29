# Revisión del plan `TODO-flujo-agentes.md`

Fecha: 2026-10-19. Alcance: gaps funcionales, de seguridad, de proceso e
incoherencias internas del plan, contrastados con el repo y con la documentación
de Cloudflare. ★ = alternativa recomendada.

## Acción inmediata

Comprobar en Cloudflare → `esencial-api` (y `esencial`) → Settings → Builds si
están activos los builds de ramas no productivas. Si lo están, cualquier rama
empujada ya obtiene una Version URL que trabaja contra la D1 y el R2 de
producción (ver P1).

## Evidencia consultada

- `.husky/pre-commit` existe y está versionado (`pnpm lint && pnpm typecheck`);
  `package.json` tiene `prepare: husky`. En el checkout principal
  `core.hooksPath` está vacío (husky lo fija al hacer `pnpm install`).
- `.github/workflows/ci.yml` corre en `pull_request` y `push` a `main`, y ejecuta
  los scripts `pnpm typecheck/test/e2e/lint` **de la rama**.
- No hay configuración de cobertura en el repo (solo `coverage/` en `.gitignore`).
- `.gitignore` no incluye `.task/` todavía.
- Cloudflare, [Compare workflows](https://developers.cloudflare.com/workers/previews/compare-workflows/):
  las Version URLs (`wrangler versions upload`, también con `--preview-alias`)
  «use production resources» y no deben usarse para previews de PR; la
  alternativa es `wrangler preview` (Previews con bindings por rama) o un Wrangler
  environment aparte.
- `DEPLOY.md` §4: las migraciones se aplican a mano con `pnpm db:migrate:remote`;
  `AGENTS.md` (Problemas conocidos §1): las aditivas van **antes** del merge.

## 1. Controles que el agente puede saltarse

El plan promete que el agente no puede cambiar lo que lo controla. Hoy eso no se
cumple en cinco puntos.

### C1 — Las puertas las define el propio diff

`pnpm lint`, `test` y `e2e` leen `package.json`, `biome.json`, las configs de
vitest y Playwright y `web/scripts/check-design-tokens.ts` **del worktree**. La CI
también: con `pull_request` ejecuta los scripts de la PR. La guarda del plan solo
cubre `.github/workflows/`, así que basta con tocar un script para que las gates
pasen siempre.

- ★ **A.** Lista de rutas protegidas en el CLI: scripts de `package.json`,
  `biome.json`, configs de vitest/Playwright, `check-design-tokens.ts`, `.husky/`,
  `flujo/`, briefs y perfiles. Si el diff toca alguna → `Blocked` hasta que la
  apruebes. ~1 h.
- **B.** Las gates usan el `package.json` de `origin/main`. Falla en cuanto una
  tarea añade una dependencia legítima.
- **C.** Bot con identidad propia + CODEOWNERS + aprobación obligatoria.
  Demasiado para un único humano.

### C2 — Un worktree montado no funciona con git dentro del contenedor

El `.git` de un worktree es un fichero que apunta a una ruta absoluta del host
(`<repo>/.git/worktrees/<nombre>`). Para que el agente haga commits hay que
montar el `.git` principal con escritura, y desde ahí el contenedor puede
reescribir las refs de `main`, `core.hooksPath` o `core.fsmonitor`. Este último es
un comando que git ejecuta **en el host** al hacer `git status`.

- ★ **A.** Sustituir el worktree por `git clone --local` por tarea (repo
  independiente). El host hace `git fetch` de la rama desde ese clon y la empuja.
  El aislamiento del e2e por directorio sigue funcionando igual.
- **B.** Worktree con el `.git` común montado en solo lectura; los commits los
  hace el host, no el agente.

Esto reabre la decisión cerrada «worktree por tarea»; la evidencia es la de arriba.

### C3 — El host ejecuta código del agente

`.husky/pre-commit` está versionado y el agente puede editarlo. Si el host hace
commit o push desde la rama con hooks activos, o lanza `pnpm install` (que
ejecuta `prepare` y los scripts de instalación), corre código del agente con las
credenciales de `gh`.

- ★ El host nunca ejecuta nada del repo sobre ramas del agente:
  `git -c core.hooksPath=/dev/null push --no-verify`, y sin `pnpm` en el host.
  ~15 min.

### C4 — El orquestador Hermes corre en el host con shell y `gh`

Con shell y credenciales puede saltarse `flujo` entero. Hoy «no hay merge
automático» depende solo de lo que diga el prompt.

- ★ **A.** Restringir los toolsets del perfil coordinador a `flujo` y nada más.
- **B.** Token de GitHub de grano fino que solo usa `flujo` y que no está en el
  entorno de Hermes.

### C5 — Clave de nan en el entorno + internet libre en el contenedor

Una inyección de prompt (desde la issue, el código o una dependencia) puede sacar
la clave fuera. El plan tampoco limita CPU ni RAM por contenedor.

- ★ `--network` con un proxy de salida que solo permita `api.nan.builders` y el
  registro npm; `--cpus` y `--memory` por contenedor. ~1 h.
- Mínimo aceptable: clave de nan exclusiva para el flujo, con tope de gasto.

## 2. Producción en riesgo

### P1 — El preview elegido usa producción

El plan propone «preview de Workers Builds» o `wrangler versions upload`. Las dos
dan Version URLs, que usan la D1 y el R2 de producción. Además, con dos Workers
(B'):

- `VITE_API_URL` queda fijado en el build del frontal: el preview del frontal
  tiene que apuntar al preview de la API.
- `WEB_ORIGIN` (CORS) y `API_ORIGIN` (CSP) tienen que cuadrar con esas URLs.
- Cloudflare Access tiene que cubrir los dominios del preview.

Alternativas:

- ★ **M4 (piloto): sin preview.** La PR lleva vídeo y capturas de Playwright y la
  validación se hace en local con `pnpm dev`. Recupera además la «vídeo demo» del
  pipeline del vídeo de referencia, que el plan perdió.
- ★ **M5: Wrangler environment `preview` persistente**: `esencial-preview` +
  `esencial-api-preview`, D1/R2 propios con datos sembrados, orígenes fijos y
  Access configurado. Una PR desplegada a la vez.
- **C.** `wrangler preview` (Previews con bindings por rama). Es nuevo: hay que
  comprobar que soporta D1, R2 y Access antes de elegirlo.

### P2 — Migraciones D1 contra «merge = deploy»

El repo exige aplicar las migraciones aditivas en remoto **antes** del merge
(`AGENTS.md`, `DEPLOY.md` §4), y las no aditivas en dos o tres tiempos. El plan no
lo menciona. Tampoco aparecen las «migraciones reversibles» de la decisión 3, y
D1 no tiene migraciones `down`.

- ★ Redefinir «reversible» como «aditiva y compatible hacia atrás», que es como
  ya trabaja el repo. Si el diff toca `api/migrations/**`: etiqueta en la PR,
  checklist en el body (¿aditiva?, comando, orden respecto al merge) y la tarea no
  pasa a `In validation` sin tu marca.
- Alternativa: exigir un `.down.sql` no aplicado por cada migración, más un test
  que lo aplique en el bootstrap. Más trabajo y sin soporte nativo de D1.

## 3. Huecos del flujo

### F1 — `In validation` no espera a la CI

La transición solo pide que `pr-review` no tenga críticos. Las gates locales y la
CI pueden divergir (otra máquina, otro entorno).

- ★ Condición adicional `gh pr checks --watch` en verde. Protección de `main` con
  checks obligatorios (CI y lint) para que el merge humano tampoco pueda saltarla.

### F2 — No hay camino de vuelta

Falta definir:

- qué pasa después de `flujo fix` (¿se repiten gates, push y pr-review?);
- qué pasa cuando tú rechazas en `In validation`: no existe la transición
  `In validation → In progress`.

- ★ Transiciones explícitas: `fix → gates → push → pr-review`, y
  `In validation → In progress` con `flujo fix --humano`, que lee tus comentarios
  de la PR y cuenta como una ronda más.

### F3 — Nadie se entera de que respondiste a la spec

El bucle de spec no tiene disparador. Además, el `spec-reviewer` «actualiza la
descripción con lo acordado» antes de que haya acuerdo, y puede pisar tu texto.

- ★ Piloto: `flujo spec` a mano. M5: sondeo de comentarios desde `flujo watch`.
- ★ El agente solo reescribe un bloque delimitado de la descripción
  (`<!-- flujo:acordado -->`); lo que escribiste tú no se toca nunca.
- Un webhook de Linear pediría un endpoint público (Tailscale Funnel o
  cloudflared): no compensa en el piloto.

### F4 — Orden `review → gates`, y ni RED ni «no debilitar» se comprueban

El revisor gasta modelo en código que quizá ni compila. «TDD estricto» y «no se
debilita un test» dependen solo de la buena fe del modelo.

- ★ Gates antes del review; el implementer corre los tests dentro de su bucle.
- ★ Checks deterministas en `flujo gates`:
  - los tests nuevos o modificados tienen que **fallar** contra el código de
    `main` (prueba de RED);
  - un `.skip`/`.only`, un test borrado o un `expect` eliminado se marcan como
    hallazgo para el reviewer.

### F5 — Sin timeout por fase ni presupuesto

Los límites de rondas no cubren una fase colgada ni una que consume tokens sin
avanzar.

- ★ Timeout y tope de tokens/coste por fase en el CLI; al agotarse → `Blocked`
  con el motivo.

## 4. Incoherencias internas

| #   | Incoherencia                                                                                                                                                                                                    | Propuesta                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I1  | El brief lo «genera `flujo start`» (l.278), lo «redacta Hermes» (l.187) y a la vez «el CLI no redacta contenido» (l.182)                                                                                        | ★ El brief es una copia determinista del bloque `flujo:acordado` de la issue                                                                                                               |
| I2  | El contenedor es «efímero por tarea» con `--rm`, pero la tarea dura días (validación, rondas de fix). No se dice si vive entre fases                                                                            | ★ Un `docker run --rm` por cada fase, con el mismo mount; los revisores montan en `:ro`. El motivo para descartar «contenedor por fase» era compartir el código, y el mount ya lo resuelve |
| I3  | M2 depende «solo de M0», pero `container` y `gates` necesitan la imagen de M1. Su «Hecho cuando» usa `flujo status --dry-run`, que no recorre el flujo. 1 día para 11 comandos y 7 módulos con TDD es optimista | Dependencia M0+M1; criterio: cada comando acepta `--dry-run` y la suite de transiciones pasa; estimación realista 2-3 días                                                                 |
| I4  | `.task/` está ignorado y `flujo clean` lo borra: `impl.md` y `review.md` se pierden. Falta un artefacto para el body de la PR (resumen + diagrama): ¿quién lo escribe si el CLI no redacta?                     | ★ Añadir `.task/pr-body.md` al contrato, escrito por el implementer. `ship` lo publica y sube `review.md` como comentario de la PR, así queda guardado en GitHub                           |
| I5  | De la decisión 3 faltan la cobertura mínima (el repo no tiene configuración de cobertura) y los ADR, que quedan aplazados a M6 sin decirlo                                                                      | Añadirlos a las puertas o apuntar en la Bitácora que se descartan para el piloto, con el motivo                                                                                            |

Menores:

- «El flujo no toca la UI» (l.271) se lee como si las tareas no tocaran la UI.
  Quiere decir que la **infraestructura** del flujo no la toca: conviene
  reformularlo.
- Actualizar `AGENTS.md` está aplazado a M6, pero `AGENTS.md` pide actualizarlo en
  cuanto se descubre algo. Mejor ir añadiendo en cada fase.

## Prioridad

1. **C2 + C3** (clon por tarea, push sin hooks): cambian el diseño de M1 y M2.
   Decidir antes de escribir código. ~30 min de rediseño.
2. **P1 + P2**: el preview y las migraciones pueden tocar producción.
3. **C1 + F1**: sin ellos las puertas no son reales.
4. **C4, C5, F2–F5**: entran en M2/M3 como checkboxes.
5. **I1–I5**: correcciones de texto en el plan.

## Pendiente de verificar

- El ajuste de builds de ramas no productivas en Workers Builds (acción inmediata).
- Si `wrangler preview` soporta D1, R2 y Cloudflare Access (P1, alternativa C).
- La diversidad de modelos disponibles en nan para que reviewer y pr-reviewer
  usen modelos distintos del implementer.
