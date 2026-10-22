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
| Spec review | tú creas; el agente comenta; tú decides (M5b) |
| Ready | **solo tú**; el agente nunca se autopromociona |
| In progress | el CLI (`run`, `start`, `fix`) |
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

## Comprobaciones

`pnpm lint && pnpm typecheck && pnpm test && pnpm e2e` en el contenedor, antes del
review. La cobertura de `api` y `web` se mide y sus umbrales solo suben (objetivo
60 % en M6). Un test nuevo o modificado debe fallar contra `main` (RED).

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
- `HERMES_HOME` se monta por fase (M2); el valor del Dockerfile es el de la
  instalación.

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
docker run --rm --network esencial-workers "<etiqueta>" bash -lc 'HERMES_HOME=/tmp/hermes hermes chat --oneshot -Q --safe-mode --provider custom --base-url http://esencial-proxy:8080/v1 --api-key dummy --model qwen3.6 -q "Responde solo: ok"'
```
