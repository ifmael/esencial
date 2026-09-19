# AGENTS.md — Esencial

Memoria del proyecto para agentes. Lee esto antes de tocar el repo; actualízalo
cuando descubras algo que no esté en los specs.

## Qué es y stack

App de bienestar personal (recetas + plan de fuerza) en **dos Workers** de
Cloudflare: uno sirve el SPA y gatea el HTML, el otro expone la API.

- `api/` — backend **Hono** sobre **Cloudflare Workers** (Worker `esencial-api`),
DB **D1** (SQLite) y R2 para las fotos.
- `web/` — SPA **React 19** + **Vite** + **react-router 7** + **Tailwind**; el
Worker del frontal (`esencial`) sirve los assets y gatea el HTML.
- Monorepo **pnpm**. **Dos despliegues** (B'): el navegador habla con los dos
Workers por separado.

## Convenciones del proyecto

- **Conventional commits** solamente. **NUNCA** añadir `Co-Authored-By` ni
atribución de IA a los commits.
- **TDD estricto (RED→GREEN)**: cada cambio empieza con un test que falla y
termina con el test verde
- **Verifica antes de afirmar**: si no estás seguro de un dato técnico. No confirmes sin verificar.
- **Respuestas concisas por defecto**: mínimo útil; expande solo si se pide o la
tarea lo requiere.
- **Propón alternativas con tradeoffs** cuando haya un cruce real de diseño.
- La UI y los datos van en **español**; nombres de ejercicios/recetas en español.

## Despliegue: dos Workers (B')

| Worker | Config | Qué sirve | URL |
| --- | --- | --- | --- |
| `esencial` (frontal) | `wrangler.toml` (raíz), `main = web/worker/index.ts` | assets de `web/dist` + guard del HTML (302 → `/login`) | `https://esencial.nutrirutina.workers.dev` |
| `esencial-api` | `api/wrangler.toml` | las rutas `/api/*` (Hono), D1 y R2; sin assets | `https://esencial-api.nutrirutina.workers.dev` |

- El navegador llama a **los dos**: la SPA usa la URL absoluta de la API
  (`VITE_API_URL`, fijada en el build) con `credentials: "include"`, y la API
  autoriza ese origen con CORS (`WEB_ORIGIN`). El frontal autoriza el origen de
  la API en su CSP (`API_ORIGIN`): los dos valores tienen que cuadrar.
- La cookie de sesión se emite desde la API, y en `workers.dev` lleva
  `Domain=<cuenta>.workers.dev` para que el Worker del frontal también la vea
  (fuera de `workers.dev` —dev/e2e en 127.0.0.1— se queda host-only; las cookies
  ignoran el puerto, así que en local se comparte igual).
- En dev/e2e esos dos orígenes se sobreescriben con `--var` (ver los scripts
  `dev:api` / `dev:web` y `e2e/playwright.config.ts`).
- Publicación: **un build de Workers Builds por Worker** (ver `DEPLOY.md` §6).

## Problemas conocidos

### 1. Migraciones locales — bootstrapeo (RESUELTO)

`api/migrations/0001_baseline.sql` ya no es un no-op: es el baseline (v1, espejo
histórico de `api/schema.sql`) y crea las tablas base. Así
`pnpm db:migrate:local` bootstrapea una base local vacía sin aplicar
`schema.sql` a mano.

- `api/schema.sql` es el **estado FINAL** del esquema (lo aplica el bootstrap de
tests junto a los deltas `0002`/`0003`/`0005`); `0001_baseline.sql` queda
congelado como v1 y NO se reescribe.
- Los deltas aditivos (`photo_path`, `section`, `recipe_tags`, `shopping_items`)
viven en `0002`+; los deltas de **reestructuración** (p. ej. `0009_fuerza_v2`
recrea `plan_sessions` con `plan_session_exercises` y `cardio_logs`) viven en
su propio número y NO se añaden al bootstrap de tests (schema.sql ya los
refleja).
- En remoto el baseline ya está aplicado en la D1 de producción; pero cada delta
nuevo hay que aplicarlo tras el deploy (`pnpm db:migrate:remote`; 0009 destruye
el histórico de planificación — ver `DEPLOY.md` §4).

### 2. wrangler pide confirmación y cuelga en no-TTY

`wrangler d1 migrations apply` muestra un prompt `(Y/n)` cuando corre en un
terminal interactivo (TTY) y se queda esperando si nadie responde.

**Solución:** invocarlo con stdin no-TTY (omite la confirmación y usa `yes`):

```bash
npx wrangler d1 migrations apply esencial --local < /dev/null
```

O ejecutar desde un entorno CI/script no-interactivo.

### 3. Embutir YouTube requiere que el Worker NO rompa el embed

Conflicto curioso: `api/src/middleware.ts` fija headers de seguridad en cada
respuesta, y dos de ellos rompen el iframe de YouTube si se vuelven a endurecer:

- `Content-Security-Policy` DEBE incluir `frame-src https://www.youtube.com`
(sin él, `default-src 'self'` bloquea el frame → el navegador no muestra el
vídeo).
- `Referrer-Policy` DEBE ser `strict-origin-when-cross-origin` (con
`same-origin` el iframe llega a YouTube sin `Referer`, y el player bloquea
con "This content is blocked. Contact the site owner to fix the issue.").

Ambos están rotos a la vez con las versiones más estrictas; con B' esas
cabeceras las pone el Worker del frontal y sus tests viven en
`web/tests/worker-guard.test.ts` (la API solo responde JSON).

### 4. `.dev.vars` en local — DOS ficheros (uno por Worker)

wrangler resuelve `.dev.vars` **junto al fichero de configuración**, no en el
cwd. Con dos Workers hacen falta dos copias del mismo contenido:

- `.dev.vars` (raíz, junto a `wrangler.toml`) — la usa el Worker del frontal.
- `api/.dev.vars` — la usa el Worker de la API (`api/wrangler.toml`).

Si falta la copia, ese Worker no ve `AUTH_SECRET`/`PASSWORD_HASH`: el login
responde **500** (`fail closed`) y todo lo protegido 401.

- Los dos son gitignored y los escribe el **mismo** script:
  `api/scripts/ensure-dev-vars.ts` (auto-generado por `pnpm dev` / `pnpm e2e`).
- La clave de desarrollo se lee de `**ESENCIAL_DEV_PASSWORD**`; si no está, se
  genera una aleatoria y se imprime al arrancar. Ninguna clave vive en git.
- Cómo fijarla: `ESENCIAL_DEV_PASSWORD='miclave' pnpm dev`.
- Ojo: la config de **tests** de la API vive en `api/tests/wrangler.test.toml`
  a propósito — si estuviera en `api/`, el `.dev.vars` de dev pisaría sus `[vars]`
  y los 202 tests fallarían (login con la clave de dev, cookie de test).

### 4b. Se arrancan DOS servidores en local

`pnpm dev` levanta los dos Workers (script `api/scripts/dev.ts`): frontal en
**8787** y API en **8789**; la SPA se construye contra `http://127.0.0.1:8789`.
Por separado: `pnpm dev:api` y `pnpm dev:web`. `pnpm deploy` publica los dos
Workers (primero el SPA con la URL de producción de la API).

### 5. `pnpm deploy` no ejecuta el script de deploy

`pnpm deploy` es un comando **interno** de pnpm (despliegue de paquetes en un
monorepo) y tiene prioridad sobre el script del `package.json`, así que falla con
`ERR_PNPM_CANNOT_DEPLOY_MANY` en vez de construir y desplegar.

**Solución:** `pnpm run deploy` (equivale a `pnpm build && wrangler deploy`).

Ojo: cualquier push a `main` ya dispara Workers Builds, que construye y despliega
solo. El comando manual solo hace falta para publicar sin push, y deja una
versión más en el historial de Deployments de Cloudflare.

## Tests e2e — base de datos propia

`pnpm e2e` **NUNCA** toca la base de desarrollo (`.wrangler/state`). El
`webServer` de Playwright arranca **sus dos servidores** con cadenas explícitas
(`e2e/playwright.config.ts`), con `reuseExistingServer: false` (así un
`pnpm dev` en marcha no se adopta):

1. API en **8790**: `ESENCIAL_DEV_PASSWORD=hola pnpm predev` → `rm -rf e2e/.state`
 → `wrangler d1 migrations apply esencial --local -c api/wrangler.toml
 --persist-to e2e/.state < /dev/null` → `wrangler dev -c api/wrangler.toml
 --port 8790 --var WEB_ORIGIN:http://127.0.0.1:8788 --persist-to e2e/.state`.
2. Frontal en **8788**: `pnpm predev` → `VITE_API_URL=http://127.0.0.1:8790 pnpm
 build` → `wrangler dev --port 8788 --var API_ORIGIN:http://127.0.0.1:8790
 --persist-to e2e/.state-web` (su propio dir de estado: el frontal no toca D1 y
 el `rm -rf e2e/.state` de la API no debe pisarle la caché).

Los `--var` son imprescindibles: sin ellos los Workers usarían los orígenes de
**producción** (los del `wrangler.toml`) y el navegador cruzaría a la API
equivocada (CORS/CSP fallan).

Lo que hay que respetar al escribir tests:

- **Añadir una migración no requiere tocar nada de `e2e/`.** La base se deriva
de `api/migrations/`. (Ojo: el bootstrap de tests de `api/` sí necesita la
tabla nueva en su lista `TABLES`, `api/tests/helpers.ts`.)
- **Nunca `POST` de un ejercicio que ya está en la semilla**: `exercises.name`
es UNIQUE y devuelve 400. El `id` se resuelve con `GET /api/exercises` y se
busca por nombre. Solo se crean por API recetas, plantillas y ejercicios de
cardio (los 91 sembrados son `kind='strength'`).
- `**workers: 1**`: hay un servidor y una base por corrida, así que el
paralelismo entre archivos es estado compartido, no aislamiento. No lo subas
sin dar a cada worker su propia base.
- **Fechas reales** (hoy, el lunes de la semana actual), no offsets por corrida.
- **La API es otro origen**: las peticiones directas de los tests usan
`apiUrl()`/`API_BASE` de `e2e/tests/helpers.ts` (y en el navegador, `fetch` con
`credentials: "include"`). Un `fetch("/api/...")` relativo iría al frontal.
- `pnpm e2e:check` corre la suite y verifica que los conteos de `.wrangler/state`
(filas D1 y objetos R2) no cambian. No navegues la app de dev mientras corre.

## Catálogo de ejercicios (seed)

`api/migrations/0004_seed_exercises.sql` siembra **91 ejercicios** / **145 tags**
con taxonomía general de grupo muscular: `pecho`, `espalda`, `hombro`, `bíceps`,
`tríceps`, `pierna`, `glúteo`, `core`, `antebrazo`, `gemelo`.
`technique_url` (vídeos de YouTube) y `steps` (arreglo JSON de pasos, columna
añadida en 0005) se ingestan por nombre en `0006_exercise_steps_data.sql`.
Todos los vídeos del catálogo son en **español** (auditado con yt-dlp en e8;
faltantes/reemplazos viven en `0007` y `0008`).
Los pasos solo faltan en ejercicios creados a mano — rellenarlos desde el
editor (textarea "Pasos de ejecución", un paso por línea).

## Fotos de recetas (R2)

- Upload: `POST /api/uploads` (multipart `file`, png/jpeg/webp ≤ 5 MB) → `200 {photo_path}`
con key `recipe-<uuid>.<ext>`; servir `GET /api/uploads/:key` tras authGuard, `Cache-Control: immutable`.
- Binding R2 `PHOTOS` → bucket `**esencial-photos**` (`api/wrangler.toml` y `api/tests/wrangler.test.toml`);
`photo_path` se valida fail-closed (regex + `PHOTOS.head`) en `POST/PUT /api/recipes`.
- El render usa `photoSrc()` (`web/src/lib/api.ts`): la key pelada + prefijo
`/api/uploads/`, y delante la URL de la API (`VITE_API_URL`).
- e2e y login dev usan la password `hola` (`ESENCIAL_DEV_PASSWORD=hola pnpm dev`).

