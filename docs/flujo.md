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
| Spec review | `watch` lanza el `spec-reviewer`; cada comentario trae la definición actual y las preguntas; si no hay preguntas, la pasa a `Ready` |
| Ready | **watch** cuando el revisor no tiene preguntas; el bloque manual sigue valiendo |
| In Progress | el CLI (`run`, `start`, `fix`) |
| In validation | el CLI, con PR revisada, `ci`/`lint`/`migracion` verdes y `mergeable` |
| Done | `watch` al ver la PR mergeada (o tú) |
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
`Veredicto: CAMBIOS`; con CAMBIOS `run` llama a `fix` y vuelve a `implement`,
hasta agotar las rondas (checks 2, review 3, pr-review 2). La cadena real es
`start → implement → check → review → pr → preview → ship → pr-review` y para en
`Blocked`, en una comprobación no corregible (guard) o al dejar la tarea en
`In validation`. `check` también reintenta solo si fallan las comprobaciones; si
faltan aprobaciones, no gasta una ronda.

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
  cada preview (deben ser aditivas). Las **83 fotos** del recetario se copiaron
  una vez del bucket de producción al de preview; si se recrea el bucket,
  repetir la copia (`wrangler r2 object get/put`).
- **Sesiones de ejemplo**: cada preview siembra la semana anterior y la actual
  (empuje, pierna y tirón) con el usuario que ya exista. Es idempotente: si un
  día ya tiene sesión, no lo toca, así que se puede copiar un día o una semana
  sin que la rejilla salga vacía.
- **Smoke autenticado**: con `CF_ACCESS_COOKIE` en el entorno del CLI (el valor
  de la cookie `CF_Authorization` del host de la API) el preview pide
  `/api/plan-sessions` y exige ver una sesión de ejemplo. Sin esa cookie se
  omite; el smoke del borde (302 de Access) sigue siendo obligatorio.
- Access: app `all_preview_workers` con una política que permite el email del
  dueño y **«Bypass OPTIONS requests»** (`options_preflight_bypass`, si no el
  preflight CORS da 403); el CLI **falla** si el preview responde 200 o si el
  preflight no autoriza la web. La cookie es por host: la web detecta que la API
  no responde y redirige al puente `/api/session/return`, que autentica el host de
  la API y vuelve a la web. Si el puente falla, abre primero la API y después la web.
- **Identidad en previews**: `ctx.access` llega `undefined` en las Preview URLs
  (limitación de Cloudflare), así que la API valida el `Cf-Access-Jwt-Assertion`
  con `jose` contra el JWKS del equipo (`TEAM_DOMAIN` + `POLICY_AUD` que pasa el
  CLI, por defecto la app `Esencial previews`). En producción sigue mandando
  `ctx.access`.
- Requisitos del token de `~/.config/orquestator/env`: **Workers Scripts: Edit**,
  **D1: Edit**, **R2: Edit** y **Access: Edit** (para la app de previews).
- **Token de GitHub** (`GH_TOKEN` en `~/.config/orquestator/env`): fine-grained,
  solo el repo `ifmael/esencial`, con **Contents** RW, **Pull requests** RW,
  **Commit statuses** RW y **Metadata** R; sin Actions/Workflows. El CLI lo usa
  para `gh` y para clonar/pushear por HTTPS, así no depende de la sesión SSH ni
  del keyring. `watch` lo recibe por `EnvironmentFile`; un `pnpm orquestator`
  manual lo lee del mismo fichero.
- Wrangler **≥ 4.135.0** (el del `devDependencies` del checkout principal); el
  host lo usa para migrar y desplegar.

## Límites

- `.github/workflows/` no es aprobable: un cambio de CI va en tu PR.
- Rutas protegidas: la lista es `orquestator-cli/protected-paths.txt` (M2) y se lee
  de `main`. Si el diff las toca, `approve` (TTY, con motivo) guarda un hash; si el
  diff cambia, la aprobación caduca. Tras cada push se publica el status `gh-guard`.
- Migraciones: solo aditivas y compatibles hacia atrás. Una aplicada es inmutable:
  cualquier cambio va en un número nuevo. Se aplican a la D1 remota tras
  `approve --migracion` y **antes** de `In validation`; el job `migracion` de la CI
  exige que estén aplicadas. Necesita el secreto `CLOUDFLARE_READ_TOKEN` y la variable
  `CLOUDFLARE_ACCOUNT_ID`; una PR desde un fork no los recibe y un maintainer
  re-ejecuta el job.

### Migraciones (M5b)

El CLI detecta los `api/migrations/**` del diff de la tarea o de una PR manual:

```bash
orquestator approve ESN-123 --migracion --motivo "aditiva"
orquestator migrate ESN-123

orquestator approve --pr 42 --migracion --motivo "aditiva"
orquestator migrate --pr 42
```

- `approve --migracion` es TTY y guarda el hash de **nombres y contenido**; cualquier
  cambio posterior invalida la aprobación. No sustituye a `approve` de rutas
  protegidas: si el diff toca ambas, hacen falta las dos.
- `migrate` exige la aprobación, comprueba que ninguna migración ya aplicada en
  `origin/main` haya cambiado y aplica **solo los ficheros aprobados** (los copia a
  un directorio temporal; no aplica pendientes ajenos). Antes de aplicar lista la D1
  remota con todas las migraciones de `main`: si hay una pendiente que no está en la
  aprobación, se para. Usa el `wrangler` del repo y el token de edición de D1; nunca
  `wrangler login`.
- Si el SQL lleva `DROP`, `ALTER … DROP` o un `ADD … NOT NULL` sin `DEFAULT`, se para:
  revisa y repite con `--force`. El `--dry-run` los enseña sin tocar la D1.
- Después re-ejecuta el job `migracion` y espera a la CI; con todo verde la tarea pasa
  a `In validation`. `ship` deja la tarea en `In Progress` cuando hay migración, en
  vez de fallar por el job `migracion` previsiblemente rojo.
- Una migración aplicada no se toca: si `migrate` ve que su contenido cambió respecto
  a `origin/main`, aborta. D1 no tiene `down`; el arreglo es otra migración.
- Reintentos: 2 por fallo de contenedor o de comprobaciones; 3 rondas de review; 2
  de `pr-review`. Las rondas humanas (`fix --humano`) cuentan aparte. Al agotarse,
  `Blocked` con la pregunta.
- Los hallazgos `crítico` vuelven al implementador; los de deuda se anotan en la
  issue.
- La clave real de nan solo vive en el proxy de modelo; los agentes usan una dummy.
- El host no ejecuta agentes ni `pnpm` del repo; push y PR los hace el CLI. Sin
  credenciales de git dentro del contenedor.

## Observabilidad (M6, nice to have)

Hoy no hay dashboard en el flujo. Hermes v0.22.4 sí trae `hermes dashboard`
(puerto 9119 por defecto), pero cada fase corre como un `hermes chat --oneshot`
efímero: no publica puertos y `watch` usa la salida y el artefacto, no una web.
Si se añade:

- Compartir `HERMES_HOME`/sesiones entre la fase y el dashboard (sidecar o host).
- Escuchar en `127.0.0.1` y llegar por túnel; si no, autenticación obligatoria.
- Mantenerlo como observación read-only: el fin de `watch` sigue siendo el proceso
  y su artefacto, no «la web está abierta».
- Si se quiere ver el stream sin perder el fin, usar `--format stream-json` y un
  evento final; el dashboard no sustituye esa señal.
- Las sesiones llevan prompts y salidas de herramientas: no exponerlas ni
  persistirlas sin limpieza.

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

## Gateway MCP (Context7)

El implementer consulta Context7 por MCP, solo lectura. El worker no sale a
internet: un sidecar Caddy hace de gateway en la red interna y reenvía a
`https://mcp.context7.com/mcp`.

```bash
docker network inspect esencial-workers >/dev/null 2>&1 || docker network create --internal esencial-workers
docker run -d --name esencial-context7 --restart unless-stopped \
  -v "$PWD/orquestator-cli/proxy/context7.Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine
docker network connect esencial-workers esencial-context7
```

El perfil `implementer` declara `mcp_servers.context7` con
`resolve-library-id` y `query-docs`, sin recursos ni prompts. Los demás perfiles
no llevan MCP. Si el gateway no está levantado, el arranque de Hermes falla al
conectar: levántalo antes de un `run`/`watch`. Al cambiar el Caddyfile:

```bash
docker restart esencial-context7
```

## Cola automática (M5b)

`orquestator watch [--max-parallel N] [--interval S] [--once]` sondea Linear
cada 60 s (equipo `ESN`; `LINEAR_TEAM` o `--team` lo cambian) y despacha:

1. Las issues en **Ready** sin estado local: llama a `run` (empieza por `start`).
2. Las tareas locales en **In Progress**: reanuda `run` (si la máquina se apagó).
3. Las **Spec review** sin bloque de acuerdo: lanza el `spec-reviewer` al entrar o
   cuando cambia la descripción o hay un comentario humano nuevo. Cada respuesta del
   revisor incluye **la definición actual completa** y las preguntas; así se ve la
   evolución desde la primera descripción. Si responde «Sin preguntas: la spec está
   lista.», actualiza la descripción con esa definición y la pasa a `Ready`; si
   publica preguntas, espera a que comentes o edites. Los comentarios del revisor
   llevan un marcador oculto para no confundirlos con los tuyos. El bloque manual
   `<!-- orquestator-cli:acordado -->` sigue funcionando y se borra al mover.
   Al arrancar también revisa las issues que ya estén en `Spec review`: si no
   quieres que se toquen, muévelas a `Backlog`.
4. Las **In validation**: si la PR está mergeada, mueve la issue a `Done` en
   Linear, pasa la tarea local a `Done` y ejecuta `clean` (borra previews y tarea).
   Si Linear falla, no limpia: lo reintenta en el siguiente sondeo.

`--max-parallel` (por defecto 1) limita los `run` simultáneos. Cada tarea tiene
un `run.lock` con el pid: dos `watch` no la arrancan a la vez, y un cerrojo de
proceso muerto se libera solo. Una tarea que falla **no se reintenta** hasta que
su estado cambie (`fix`, `resume` o edición); así un check rojo no quema tokens.
`--once` hace una pasada y espera a las tareas; `--dry-run` enseña lo que haría.

### Servicio de usuario

La unidad está en `orquestator-cli/systemd/orquestator-watch.service`; ajusta
`WorkingDirectory` si el repo no está en `%h/Projects/esencial`:

```bash
mkdir -p ~/.config/systemd/user
cp orquestator-cli/systemd/orquestator-watch.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now orquestator-watch.service
loginctl enable-linger "$USER"   # sigue tras cerrar sesión
journalctl --user -u orquestator-watch -f
```

`SIGTERM` deja de despachar y espera a las tareas en curso; el `TimeoutStopSec`
de la unidad acota la espera. Si la máquina se apaga, al volver el servicio
reanuda desde el estado del host.

La unidad entra con `newgrp docker`: el gestor de usuario arrancó antes de que la
cuenta estuviera en el grupo `docker`, así que el servicio no lo hereda y Docker
responde «permission denied». `watch` comprueba `docker info` al arrancar y falla
con un mensaje claro si no hay acceso, en vez de dejar que la primera tarea
muera en `implement`.

### Job `guard`

El job `guard` de la CI lee `orquestator-cli/protected-paths.txt` de la base
(`origin/main`), no de la rama, y si el diff toca una ruta protegida exige el
status `gh-guard` (lo publica `orquestator ship` antes de esperar a la CI). Sin
status, el job espera 90 s y falla. El **job** se llama `guard`; el **estado** que
lee se llama `gh-guard`, para no confundirlos. Los cambios de `.github/workflows/` se
revisan a mano y el job no los exige: el CLI no puede aprobarlos. Para que
bloquee el merge, añade **`guard` (el job) a los checks requeridos** de `main` en
GitHub; el job ya verifica el estado `gh-guard`.

`approve` sigue siendo local y con TTY: el status solo se publica tras ese paso.
Para una PR manual, el atajo es:

```bash
pnpm aprobar --pr 62 --motivo "revisado"
```

Equivale a `pnpm orquestator approve --pr 62 --motivo "revisado"`. Sin TTY no
funciona: es la aprobación humana.
