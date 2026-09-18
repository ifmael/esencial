# AGENTS.md — Esencial

Memoria del proyecto para agentes. Lee esto antes de tocar el repo; actualízalo
cuando descubras algo que no esté en los specs.

## Qué es y stack

App de bienestar personal (recetas + plan de fuerza) en un solo Worker de
Cloudflare que sirve API y SPA.

- `api/` — backend **Hono** sobre **Cloudflare Workers**, DB **D1** (SQLite).
- `web/` — SPA **React 19** + **Vite** + **react-router 7** + **Tailwind**.
- Monorepo **pnpm**. El Worker sirve `/api/*` y los assets del SPA en la misma URL.
- `openspec/` — specs y cambios versionados; los `design.md`/`spec.md`/`tasks.md`
  documentan cada decisión.

## Convenciones del proyecto

- **Conventional commits** solamente. **NUNCA** añadir `Co-Authored-By` ni
  atribución de IA a los commits.
- **TDD estricto (RED→GREEN)**: cada cambio empieza con un test que falla y
  termina con el test verde (los `tasks.md` usan este patrón `RED+GREEN`).
- **Verifica antes de afirmar**: si no estás seguro de un dato técnico,
  investiga en el código/`specs` antes de declararlo. No confirmes sin verificar.
- **Respuestas concisas por defecto**: mínimo útil; expande solo si se pide o la
  tarea lo requiere.
- **Propón alternativas con tradeoffs** cuando haya un cruce real de diseño.
- La UI y los datos van en **español**; nombres de ejercicios/recetas en español.

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

Ambos están rotos a la vez con las versiones más estrictas; los tests de
estos headers viven en `api/tests/auth-gate.test.ts`.

### 4. `.dev.vars` en local — ubicación y acceso

wrangler lee `.dev.vars` desde la **raíz del repo** (junto a `wrangler.toml`),
**no** desde `api/`. Si se pone en `api/.dev.vars` el Worker no ve `AUTH_SECRET`/
`PASSWORD_HASH`, y login responde **500** (`fail closed`) y todo lo protegido 401.

- Archivo: `.dev.vars` (raíz), gitignored.
- **Auto-generado:** `pnpm dev` crea/repara `.dev.vars` (`api/scripts/ensure-dev-vars.ts`). La clave de desarrollo se lee de la variable de entorno **`ESENCIAL_DEV_PASSWORD`**; si no está, se genera una aleatoria y se imprime al arrancar. Ninguna clave vive en git.
- Cómo fijarla: `ESENCIAL_DEV_PASSWORD='miclave' pnpm dev` (o `export ESENCIAL_DEV_PASSWORD='miclave'`). El predev regenera el hash en `.dev.vars` al arrancar.

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
`webServer` de Playwright arranca su propio servidor con una cadena explícita
(`e2e/playwright.config.ts`), en el puerto **8788** con
`reuseExistingServer: false` (así un `pnpm dev` en 8787 no se adopta):

1. `ESENCIAL_DEV_PASSWORD=hola pnpm predev` — deja `.dev.vars` con la password
   que e2e espera.
2. `rm -rf e2e/.state` — la base de e2e nace vacía en cada corrida.
3. `wrangler d1 migrations apply esencial --local --persist-to e2e/.state` —
   toda `api/migrations/` se aplica en orden (esquema + catálogo sembrado).
4. `pnpm build` y `wrangler dev --persist-to e2e/.state --port 8788`.

Lo que hay que respetar al escribir tests:

- **Añadir una migración no requiere tocar nada de `e2e/`.** La base se deriva
  de `api/migrations/`. (Ojo: el bootstrap de tests de `api/` sí necesita la
  tabla nueva en su lista `TABLES`, `api/tests/helpers.ts`.)
- **Nunca `POST` de un ejercicio que ya está en la semilla**: `exercises.name`
  es UNIQUE y devuelve 400. El `id` se resuelve con `GET /api/exercises` y se
  busca por nombre. Solo se crean por API recetas, plantillas y ejercicios de
  cardio (los 91 sembrados son `kind='strength'`).
- **`workers: 1`**: hay un servidor y una base por corrida, así que el
  paralelismo entre archivos es estado compartido, no aislamiento. No lo subas
  sin dar a cada worker su propia base.
- **Fechas reales** (hoy, el lunes de la semana actual), no offsets por corrida.
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
- Binding R2 `PHOTOS` → bucket **`esencial-photos`** (`wrangler.toml` y `api/wrangler.test.toml`);
  `photo_path` se valida fail-closed (regex + `PHOTOS.head`) en `POST/PUT /api/recipes`.
- El render usa `photoSrc()` (`web/src/lib/api.ts`): la key pelada + prefijo `/api/uploads/`.
- e2e y login dev usan la password `hola` (`ESENCIAL_DEV_PASSWORD=hola pnpm dev`).
