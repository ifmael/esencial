# Flujo agéntico — convención

El plan vive en `TODO-flujo-agentes.md`. Esto es lo que hay que respetar cuando una
tarea la lleva un agente (`orquestator-cli`, M2). Las reglas del repo no cambian:
TDD, conventional commits, sin atribución de IA, UI y datos en español.

## Ramas y PR

- Rama `ESN-123-slug` desde `main`. El CLI **nunca** empuja a `main` ni usa `--force`.
- Título de la PR: `ESN-123 <título>`. En el cuerpo, `Fixes ESN-123`: al mergear,
  Linear cierra la issue y enlaza la PR por la rama.
- La PR lleva resumen, criterios cubiertos, plan de pruebas, riesgos y un diagrama
  Mermaid (`.task/pr-body.md`). El merge siempre lo hace una persona.

## Estados (Linear)

| Estado | Quién lo mueve |
|---|---|
| Backlog | tú |
| Spec review | tú creas; el agente comenta sus preguntas; tú decides (el bucle automático llega en M5b) |
| Ready | **solo tú**; el agente nunca se autopromociona |
| In Progress | el CLI (`run`, `start`, `fix`) |
| In validation | el CLI, con PR revisada, `ci`/`lint`/`migracion` verdes y `mergeable` |
| Done | tú al mergear (o la integración GitHub) |
| Blocked | el CLI o tú, con una pregunta concreta; `resume` vuelve a la fase anterior |

## Artefactos

Viven en `~/.orquestator/ESN-123/task/` (host) y se montan en `<clon>/.task/`
(ignorado por git). Cada fase escribe solo el suyo:

| Fichero | Lo escribe |
|---|---|
| `brief.md` | `start` (copia de la issue) |
| `impl.md` | implementer (plan de pruebas + qué se hizo) |
| `checks.md` | `check` (lint, tipos, tests, cobertura, e2e) |
| `review.md` | `review` |
| `pr-review.md` | `pr-review` |
| `pr-body.md` | implementer |
| `human-feedback.md` | host (solo tus comentarios, filtrados por autor) |

El estado interno y el hash de `approve` viven en `~/.orquestator/ESN-123/state.json`,
en el host. El agente no puede tocarlos.

## Fases de agente (M3)

`implement`, `review` y `pr-review` lanzan un perfil de Hermes en el contenedor de la
tarea (`run` los encadena). El prompt va por stdin y la respuesta final se escribe en
el artefacto de la fase:

```bash
hermes chat --oneshot -Q --safe-mode --yolo \
  --provider custom --base-url http://esencial-proxy:8080/v1 --api-key dummy \
  --model <modelo> --query-file - > /work/.task/<artefacto>
```

- La config de cada fase vive en `~/.orquestator/ESN-123/hermes/<fase>/` y se monta
  **encima** del home que trae la imagen (`config.yaml`, `SOUL.md` y `skills/`). No se
  reemplaza `HERMES_HOME` entero: un home vacío obliga a Hermes a instalar sus
  dependencias (necesita red) y el contenedor corre sin salida. Las skills van como
  `skills.external_dirs` en ro. El esfuerzo no tiene flag en `hermes chat`: va en
  `agent.reasoning_effort`.
- Los agentes solo ven el clon, los artefactos y el espejo (ro); `spec-review` monta
  `main` en ro y no ve ningún clon de tarea.
- **AGENTS.md**: Hermes lo lee del proyecto (cadena de la raíz git al directorio de
  trabajo), no de `HERMES_HOME`. El implementer lee el de la rama y puede actualizarlo;
  `review` y `pr-review` reciben encima el de `origin/main` montado en ro, así que el
  implementer no puede cambiar las reglas que lee el revisor. `spec-review` ya ve `main`.
- **Identidad por rol**: `orquestator-cli/perfiles/soul/<fase>.md` se copia como
  `HERMES_HOME/SOUL.md`; Hermes lo carga siempre (el `AGENTS.md` del repo sigue siendo
  el núcleo común, sin duplicar).
- **Skills por rol**: `orquestator-cli/perfiles/skills/<fase>/` se copia a
  `HERMES_HOME/skills/`; Hermes las indexa y el agente las carga cuando las necesita.
  No se usan skills de proyecto (`.hermes/skills`), que exigirían `hermes skills trust`.
- Identidad de git dentro del contenedor: `orquestator <orquestator@esencial.invalid>`;
  sin push (lo hace el host).
- El implementer escribe `impl.md` (respuesta final) y `pr-body.md` (con sus tools).

| Fase | Comando | Modelo | Esfuerzo | Artefacto |
|---|---|---|---|---|
| spec-reviewer | `spec-review` | `qwen3.8-flash` | `max` | `spec-review.md` + comentario |
| implementer | `implement` | `deepseek-v4-flash` | `xhigh` | `impl.md`, `pr-body.md` |
| reviewer | `review` | `qwen3.8-flash` | `max` | `review.md` |
| pr-reviewer | `pr-review` | `deepseek-v4-flash` | `ultra` | `pr-review.md` |

Roles decididos para el piloto: los cuatro de la tabla. Después del piloto: `test-auditor`
(tests que prueban comportamiento) y `security-auditor` (diffs de autenticación, API,
cabeceras o datos).

Modelo y esfuerzo se cambian sin tocar código con `ORQUESTATOR_MODEL_<FASE>` y
`ORQUESTATOR_EFFORT_<FASE>` (`SPEC_REVIEW`, `IMPLEMENTER`, `REVIEWER`, `PR_REVIEW`).

`review.md` y `pr-review.md` empiezan con `Veredicto: APROBADO` o
`Veredicto: CAMBIOS`; con CAMBIOS el comando sale con 1 y toca
`fix --from review|pr-review`. La cadena real es
`start → implement → check → review → pr → ship → pr-review` y para en `Blocked`,
en una comprobación que falla o al dejar la tarea en `In validation`.

## Comprobaciones

`pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm e2e` en el contenedor,
antes del review. Si la rama aún no tiene `test:coverage` (main antes del merge de M2),
cae a `pnpm test` sin ocultar fallos. La cobertura se mide en las dos partes: `api` con istanbul (v8 no
ve el código dentro de workerd) y `web` con v8; los umbrales solo suben. Hoy:
api 95/90/99/97 y web 86/85/86/88 (sentencias/ramas/funciones/líneas). Un test
nuevo o modificado debe fallar contra `main` (RED).

## Preview por rama (M5a)

Cada tarea obtiene un preview aislado de producción con dos URLs predecibles:
`https://<clave>-esencial.nutrirutina.workers.dev` y
`https://<clave>-esencial-api.nutrirutina.workers.dev` (la clave en minúsculas).

- `orquestator preview ESN-123` construye la web con `VITE_API_URL` del preview,
  aplica las migraciones a la D1 de preview y despliega los dos Workers con
  `wrangler preview`. `run` lo hace entre `pr` y `ship`.
- El enlace queda en el body de la PR (bloque `<!-- preview -->`) y en
  `state.preview`; `clean` borra los dos previews antes de borrar el clon.
- Datos: D1 `esencial-preview` y R2 `esencial-photos-preview`, **compartidos por
  todos los previews** y nunca los de producción. Las migraciones se aplican en
  cada preview (deben ser aditivas). Las fotos no se copian: las recetas salen
  con monograma hasta que se suban a ese bucket.
- Access: app `all_preview_workers` con una política que permite el email del
  dueño y **«Bypass OPTIONS requests»** (`options_preflight_bypass`, si no el
  preflight CORS da 403); el CLI **falla** si el preview responde 200 o si el
  preflight no autoriza la web. La cookie es por host: abre primero la URL de la
  API y después la web.
- Requisitos del token de `~/.config/orquestator/env`: **Workers Scripts: Edit**,
  **D1: Edit**, **R2: Edit** y **Access: Edit** (para la app de previews).
- Wrangler **≥ 4.135.0** (el del `devDependencies` del checkout principal); el
  host lo usa para migrar y desplegar.

## Límites

- `.github/workflows/` no es aprobable: un cambio de CI va en tu PR.
- Rutas protegidas: la lista es `orquestator-cli/protected-paths.txt` (M2) y se lee
  de `main`. Si el diff las toca, `approve` (TTY, con motivo) guarda un hash; si el
  diff cambia, la aprobación caduca. Tras cada push se publica el status `guard`.
- Migraciones: solo aditivas y compatibles hacia atrás. Una aplicada es inmutable:
  cualquier cambio va en un número nuevo. Se aplican a la D1 remota tras
  `approve --migracion` y **antes** de `In validation`; el job `migracion` de la CI
  exige que estén aplicadas. Necesita el secreto `CLOUDFLARE_READ_TOKEN` y la variable
  `CLOUDFLARE_ACCOUNT_ID`; una PR desde un fork no los recibe y un maintainer
  re-ejecuta el job.
- Reintentos: 2 por fallo de contenedor o de comprobaciones; 3 rondas de review; 2
  de `pr-review`. Las rondas humanas (`fix --humano`) cuentan aparte. Al agotarse,
  `Blocked` con la pregunta.
- Los hallazgos `crítico` vuelven al implementador; los de deuda se anotan en la
  issue.
- La clave real de nan solo vive en el proxy de modelo; los agentes usan una dummy.
- El host no ejecuta agentes ni `pnpm` del repo; push y PR los hace el CLI. Sin
  credenciales de git dentro del contenedor.

## Imagen del worker (M1)

```bash
orquestator-cli/build.sh         # construye e imprime la etiqueta
docker run --rm -v "$PWD:/work" -w /work --network none "<etiqueta>" pnpm test
```

- Base `node:24-bookworm` (el Node del CI), pnpm 12.4.2, Chromium de Playwright y
  Hermes v0.22.4 fijado por commit (`HERMES_COMMIT` en el Dockerfile).
- La etiqueta es el hash del Dockerfile y de `pnpm-lock.yaml`: un cambio en
  cualquiera de los dos produce una imagen nueva.
- El store de pnpm (`--store-dir /opt/pnpm-store`) y los navegadores viven en la
  imagen; el clon de la tarea instala con
  `pnpm install --offline --frozen-lockfile --store-dir /opt/pnpm-store`.
- Hermes queda instalado con su home preparado en `/opt/hermes/home`: **ese** es
  el `HERMES_HOME` (uno vacío obliga a descargar dependencias y sin red falla).
  Cada fase corre en un contenedor nuevo, así que el home sigue aislado.

## Proxy de modelo

La clave real de nan vive solo en el proxy; el worker usa `dummy` y no tiene
salida propia a internet (red interna).

```bash
docker network inspect esencial-workers >/dev/null 2>&1 || docker network create --internal esencial-workers
set -a; . ~/.config/orquestator/env; set +a   # exporta las variables para -e
docker run -d --name esencial-proxy --restart unless-stopped -e NAN_API_KEY \
  -p 127.0.0.1:8799:8080 \
  -v "$PWD/orquestator-cli/proxy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine
docker network connect esencial-workers esencial-proxy
```

Prueba del proxy y una consulta del agente con la clave dummy:

```bash
curl -s http://127.0.0.1:8799/v1/models -H "Authorization: Bearer dummy" | head -c 200
docker run --rm --init --network esencial-workers \
  --cpus 4 --memory 8g --pids-limit 2048 \
  --cap-drop=ALL --security-opt=no-new-privileges \
  "<etiqueta>" bash -lc 'HERMES_HOME=/opt/hermes/home \
  hermes chat --oneshot -Q --safe-mode --provider custom \
    --base-url http://esencial-proxy:8080/v1 --api-key dummy \
    --model qwen3.6 -q "Responde solo: ok"'
```
