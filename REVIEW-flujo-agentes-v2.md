# Revisión v2 del plan `TODO-flujo-agentes.md`

Fecha: 2026-10-21. Revisa la versión del plan actualizada el 2026-10-21 (Bitácora
hasta «I2-I5»). La revisión anterior está en `REVIEW-flujo-agentes.md`.
★ = alternativa recomendada. Los números de línea son los del plan revisado.

## Acción inmediata

En la l.274, cambiar «objetos por hardlink» por `git clone --local --no-hardlinks`.
El `.git` pesa 20 MB, así que copiarlo no cuesta nada, y con hardlinks el worker
puede corromper los objetos de `main` (N2).

## Estado de la revisión anterior

Se abordaron 15 de los 16 hallazgos. **I1 sigue abierto**: la Bitácora pasa de I5 a
«I2-I5» y nunca resuelve I1. Varios de los abordados dejan restos, recogidos abajo.

| Hallazgo v1 | Estado | Resto |
|---|---|---|
| C1 rutas protegidas | Abordado | Falta la infraestructura de test (N5) |
| C2 clon por tarea | Abordado | Hardlinks (N2) |
| C3 host sin hooks | Abordado | La lista de lo que se desactiva no basta (N1) |
| C4 coordinador restringido | Abordado | Cuestionable si hace falta (D1) |
| C5 red y secretos | Abordado | Regla antigua en l.415 |
| P1 preview | Abordado | M5 infraestimado (D5) |
| P2 migraciones | Abordado | Sin mecanismo «antes del merge» (N4) |
| F1 CI | Abordado | — |
| F2 retorno | Abordado | El orden contradice F4 (l.140/346); contador de rondas (D4) |
| F3 spec | Abordado (pospuesto a M5) | — |
| F4 RED / no debilitar | Abordado | — |
| F5 límites | Abordado | — |
| I1 brief | **Abierto** | — |
| I2 contenedor por fase | Abordado | El texto antiguo sigue en l.113/157 |
| I3 M2 | Abordado | El «Hecho cuando» de l.610 no cambió |
| I4 pr-body | Abordado | — |
| I5 cobertura y ADR | Abordado | Contradice l.737 |

## Evidencia consultada

- Tamaño del repo: `.git` 20 MB (`size-pack` 12,27 MiB).
- `wrangler` del repo: 4.128.0.
- Git del host: 2.56.0.
- Infraestructura de test que hoy no está en `protected-paths`: `api/tests/helpers.ts`,
  `api/tests/wrangler.test.toml`, `web/tests/setup.ts`,
  `web/tests/audio-fake.ts`, `web/tests/view-transition-stub.ts` y
  `e2e/tests/helpers.ts`.
- Comportamiento de git (por documentación, no probado aquí): las claves
  `diff.external`, `diff.<driver>.textconv`, `filter.<driver>.{clean,smudge,process}`,
  `core.pager`, `core.sshCommand`, `core.editor`, `credential.helper`,
  `gpg.program` y `core.askPass` ejecutan comandos y se leen del `.git/config` del
  repositorio donde corre git.

## 1. Seguridad: cerrar antes de escribir M2

### N1 — El host ejecuta git dentro del clon

El `.git/config` del clon lo escribe el agente. C3-A desactiva solo
`core.hooksPath` y `core.fsmonitor`, pero hay más claves que ejecutan comandos
(ver Evidencia). Cuando el host hace `git diff` en el clon para `guard`, o
cualquier otra operación con `cwd` en él, puede ejecutar código del agente con el
token de GitHub y la clave de Cloudflare en el entorno.

Además, el coordinador corre con `cwd` en el clon (l.128, l.214) y Hermes carga
`AGENTS.md` como contexto. El implementer puede haber editado ese `AGENTS.md`, y
`guard` solo lo detecta en `check`/`ship`, después de que el coordinador ya lo haya
leído.

- ★ **A.** El host nunca corre git con `cwd` en el clon. Importa la rama desde el
  checkout principal (`git fetch <clon> +refs/heads/X:refs/orquestator-cli/X`) y
  calcula todos los diffs ahí, con `--no-ext-diff --no-textconv`. Los atributos y
  filtros salen de la configuración del checkout principal, que es de confianza.
  El coordinador arranca con un `cwd` neutro (p. ej. `~/.orquestator/ESQ-123/`).
  ~30 min de diseño.
- **B.** Mantener git en el clon con una denylist más larga. Es frágil: cada
  versión de git puede añadir claves nuevas.

Test que conviene dejar: `guard` sobre un clon con `diff.external` malicioso no
ejecuta nada.

### N2 — `git clone --local` comparte objetos por hardlink

Con hardlinks, los ficheros de `.git/objects` del clon son los mismos inodos que los
del checkout principal. El worker corre con el UID del host, así que puede hacer
`chmod` y reescribirlos. Eso corrompe `main` o envenena su contenido.

- ★ `git clone --local --no-hardlinks`. Coste: ~20 MB por tarea.

### N3 — Repo público + comentarios de la PR como entrada del agente

`fix --humano` «lee tus comentarios de la PR» (l.140, l.353). En un repo público
cualquiera puede comentar: es inyección de prompt directa al implementer. El
`pr-reviewer` tiene la misma exposición si lee el hilo de la PR.

- ★ El CLI filtra los comentarios por autor (tu login) antes de escribir
  `.task/human-feedback.md`. El `pr-reviewer` recibe el diff, no el hilo.
- ★ En GitHub, activar «Require approval for all outside collaborators» para los
  workflows de PRs desde forks.

### N4 — Migraciones: falta el mecanismo, la credencial y el orden

1. **Mecanismo.** «El CLI aplica la migración remota antes del merge» (l.152,
   l.422), pero el merge es un clic tuyo en GitHub y el CLI no sabe cuándo lo vas a
   dar.
2. **Credencial.** No se define con qué credencial de Cloudflare trabaja el CLI.
   `wrangler login` en el host da OAuth a toda la cuenta.
3. **Paralelismo.** Dos tareas a la vez pueden crear las dos un `0027_*.sql`, y el
   orden de merge puede no coincidir con el de aplicación.

- ★ Commit status `migracion` exigido por la protección de `main`. El CLI lo pone
  en verde si el diff no tiene migraciones, o después de aplicarlas tras tu
  `approve --migracion`. Sin él, GitHub no deja mergear. El token de GitHub
  necesita `Commit statuses: write`.
- ★ API token de Cloudflare limitado (D1 edit + Workers scripts edit), solo en el
  entorno del CLI; nunca `wrangler login`.
- ★ `start` rechaza una segunda tarea con migración mientras otra tenga una sin
  mergear, o reserva el número de migración en `.task/state.json`.
- Orden: migrar antes la D1 de preview (M5) y la remota solo cuando la tarea esté
  en `In validation` y aprobada.

### N5 — Rutas protegidas incompletas

Un `setup.ts` global o un helper de bootstrap puede anular todos los tests sin tocar
ninguno: un mock que siempre devuelve éxito, una base vacía, un `expect` silenciado.

- ★ Añadir a `protected-paths.txt`: `api/tests/helpers.ts`,
  `api/tests/wrangler.test.toml`, `web/tests/setup.ts`, `web/tests/audio-fake.ts`,
  `web/tests/view-transition-stub.ts` y `e2e/tests/helpers.ts`.
- ★ Marcar `.github/workflows/` como **no aprobable**. Hoy es una ruta protegida
  aprobable con `approve`, pero el token no tiene el permiso `Workflows` y el push
  fallaría igual (l.430). Un cambio de CI va siempre en una PR tuya, fuera del
  flujo.

## 2. Diseño

### D1 — El coordinador ya no decide nada

Desde F2, todas las transiciones están fijadas: `start → check → review → ship →
pr-review`, y cada `fix --from X` tiene su secuencia. Al coordinador solo le queda
pulsar el siguiente botón. A cambio cuesta:

- el plugin `orquestator` y su instalación como plugin de usuario;
- N procesos de Hermes en el host, uno por tarea, y la superficie de C4;
- tokens mientras espera a la CI o a ti (no se define si termina en los estados de
  espera).

Alternativas:

- ★ **A.** En el piloto, `orquestator-cli run ESQ-123` encadena las fases de forma
  determinista y sin coordinador. Se añade un coordinador si aparece una decisión
  que el CLI no pueda tomar. Ahorra ~1 día de M3 y elimina C4 del piloto. Reabre la
  decisión «Nivel 2»; la evidencia es F2.
- **B.** Mantener el coordinador, pero que **termine** en `Blocked` e
  `In validation` y que `watch` lo relance con el evento (respuesta, CI verde,
  rechazo).

### D2 — El MCP de Linear no se usa

El CLI habla con la API de Linear (módulo `linear`) y el coordinador solo tiene el
plugin (C4). Aun así, la l.132 dice «MCP de Linear», M0 lo configura (l.535) y el
«Hecho cuando» de M0 depende de él (l.540).

- ★ Quitarlo de la l.132 y de M0. Nuevo «Hecho cuando» de M0: una issue de prueba
  se lee con `orquestator-cli inspect --what issue` (o con la API) y una rama
  empujada aparece enlazada.

### D3 — La imagen se queda vieja y la red no se prueba en M1

1. La imagen se etiqueta solo por el hash del Dockerfile (l.213, l.554), pero el
   store de pnpm sale del lockfile. Cuando cambie `pnpm-lock.yaml` en `main`,
   `pnpm install --offline` fallará en todas las tareas.
2. El smoke test de M1 (l.555) no corre en la red interna. `wrangler dev` puede
   intentar salir (telemetría, comprobación de versión) y se descubriría en M4.

- ★ Etiquetar la imagen por hash de Dockerfile + `pnpm-lock.yaml`.
- ★ Smoke test de M1 en las mismas condiciones que el flujo: `--network none` para
  `check` (no necesita el proxy de modelo) y `WRANGLER_SEND_METRICS=false`.

### D4 — Contador de rondas ambiguo

«Tu rechazo en `In validation` cuenta como ronda» (l.140, l.426) no dice de qué
contador. Si es el de PR review (máx. 2), tras dos rondas tu propio rechazo deja la
tarea en `Blocked`.

- ★ Contador aparte para las rondas humanas, que nunca bloquean solas. Su único
  efecto es quedar en la Bitácora y en la retro.

### D5 — M5 infraestimado

M5 (l.657, «≈0,5-1 día») incluye: subir `wrangler`, previews de dos Workers con D1/R2
propios, orígenes cruzados, datos sembrados, limpieza, Access, `spec-reviewer` con su
bucle, `watch` como servicio de systemd y el job `guard` de CI.

- ★ Estimación realista: 3-5 días. Partir en **M5a — Preview** (wrangler, previews,
  Access, datos, limpieza) y **M5b — Automatización** (`spec-reviewer`, `watch`,
  job `guard`, medición).

## 3. Incoherencias de texto

~20 min en total.

| Línea | Problema | Corrección |
|---|---|---|
| 216 vs 441 vs 141 | **I1**: el coordinador «redacta la spec y el brief», pero el brief lo genera `start` desde la issue y en el piloto la spec la escribes tú | El brief es una copia determinista de la issue (o del bloque `orquestator-cli:acordado` en M5); el coordinador no redacta |
| 140, 346 | `fix --from review → implementer → review → check` contradice F4 (comprobaciones antes del review) | `→ implementer → check → review` |
| 113, 157 | La tabla de fuentes dice «Contenedor efímero por tarea» y el descarte incluye «contenedor por fase», cuando se adoptó lo contrario (l.126, l.144) | Corregir la fila y sacar «contenedor por fase» de los descartes |
| 415 | «La clave de nan viaja por entorno» | La clave real solo vive en el proxy de modelo; los agentes usan una dummy (C5) |
| 198 | `pr-review` lo lanza «Hermes/CI» | Solo en local; la CI no tiene la clave de nan ni el token del CLI |
| 737 | «Nada de `api/` ni `web/` en esta fase», pero la cobertura añade `@vitest/coverage-v8` y toca `api/vitest.config.ts` y `web/vite.config.ts` | Exceptuar la cobertura (cambio humano, rutas protegidas) |
| 610 | El «Hecho cuando» de M2 sigue siendo `status --dry-run`, que no recorre el flujo | «Cada comando acepta `--dry-run` sin efectos y la suite de transiciones pasa» (como la l.145) |
| 190 vs 166, 605 | El clon lo crean a la vez `start` y `watch` | Uno solo: `start` crea el clon y `watch` solo llama a `start` |
| 10, 645 | La fecha se quedó en el 2026-10-19; M4 pasa por `Spec review` aunque en el piloto no se usa | Fecha del 2026-10-21; en M4, la issue va directa a `Ready` |

## 4. Preguntas abiertas que ya se pueden cerrar

1. **¿Dónde corre `pr-review`?** En un contenedor con el clon en solo lectura y sin
   red. El CLI baja `gh pr diff` en el host, lo deja en `.task/` y publica él los
   comentarios a partir de `.task/pr-review.md`. Así el revisor no necesita token
   ni red (y encaja con N3).
2. **¿Qué `wrangler` se fija?** El de `devDependencies` del repo (hoy 4.128.0; subir
   a ≥4.135.0 en M5), ejecutado desde el checkout principal, que es de confianza.
   Un solo número que mantener.
3. **¿Heurística de SQL destructivo en `migrate`?** Sí: un grep de `DROP`,
   `ALTER … DROP` y `NOT NULL` sin `DEFAULT`, que obliga a dar el motivo en
   `approve --migracion`. Son unas 10 líneas y complementan tu checklist.

## 5. Menor

- **Nombre `orquestator-cli`**: no es ni inglés (*orchestrator*) ni español
  (*orquestador*). Renombrarlo es gratis hoy y caro después de M2 (rutas, refs
  `refs/orquestator-cli/…`, plugin, `protected-paths`).
- **RED por error de import**: un test nuevo que importa un módulo que no existe en
  `main` falla «por la razón equivocada» y pasa el check RED sin probar nada.
  Limitación aceptable para el piloto; anotarla en `checks.md` como «RED por
  import».

## Prioridad

1. **N1 + N2**: cambian el módulo `checkout` y el `cwd` del coordinador. Decidir
   antes de escribir M2. ~30 min.
2. **D1**: decide si M3 incluye el coordinador y el plugin. Cambia el alcance de M2
   y M3.
3. **N4 + N5**: completan `guard` y `migrate`, que entran en M2.
4. **N3, D2–D5**: checkboxes en M0, M1, M2 y M5.
5. **Incoherencias**: correcciones de texto en el plan.

## Pendiente de verificar

- N1 se basa en la documentación de git; no está probado aquí. Conviene un test de
  `guard` con un `diff.external` malicioso.
- Si `wrangler preview` soporta D1, R2 y Cloudflare Access (sigue abierto desde la
  v1).
- La diversidad de modelos de nan para que `reviewer` y `pr-reviewer` usen modelos
  distintos del `implementer`.
