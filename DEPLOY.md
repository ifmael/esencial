# Deploy — Esencial a Cloudflare (cuenta del usuario)

**Dos Workers** (B'): `esencial` (frontal: assets + guard del HTML) y
`esencial-api` (API: Hono + D1 + R2). Requisito: Node 24. Todo desde la raíz del
repo.

## 1. Login (una vez)

```bash
npx wrangler login        # abre el navegador; acepta los permisos
```

## 2. Crear la base de datos D1 (una vez)

```bash
npx wrangler d1 create esencial
```

Copia el `database_id` que imprime y pégalo en `api/wrangler.toml`.

## 3. Crear el bucket R2 de fotos (una vez)

```bash
npx wrangler r2 bucket create esencial-photos
```

El binding `PHOTOS` de `api/wrangler.toml` lo requiere; sin este paso el deploy
de la API falla (el bucket no se crea automáticamente).

## 4. Aplicar migraciones (cada vez que cambie el esquema)

```bash
# = wrangler d1 migrations apply esencial --remote -c api/wrangler.toml
# Registra cada archivo de api/migrations/ en _cf_D1_MIGRATIONS y lo ejecuta
# una sola vez (idempotente). 0001 es el baseline (v1) y bootstrapea una base
# vacía; `api/schema.sql` refleja el estado final; los deltas viven en 0002+.
#
# ⚠️ 0009_fuerza_v2 RECREA las tablas de planificación de fuerza
#    (plan_sessions / workout_logs / set_logs): se pierden las sesiones
#    planificadas y el historial registrado. Ejecutarla justo después del deploy.
pnpm db:migrate:remote
```

La base es la MISMA para los dos Workers; solo la API la toca.

## 5. Secretos (una vez, y al rotar la contraseña)

**Los dos Workers necesitan `AUTH_SECRET`** (firma/valida la cookie de sesión:
el frontal la comprueba en el guard, la API en cada `/api/*`). **Solo la API
necesita `PASSWORD_HASH`.**

```bash
# Clave de firma de sesión: el MISMO valor en los dos Workers. Genérala UNA vez
# y úsala en los dos comandos (o reutiliza la que ya tenías en `esencial`:
# dos valores distintos = el frontal y la API no coincidirían y no podrías
# entrar).
S=$(openssl rand -base64 24)
printf '%s' "$S" | npx wrangler secret put AUTH_SECRET -c api/wrangler.toml
printf '%s' "$S" | npx wrangler secret put AUTH_SECRET            # frontal

# Digest PBKDF2 de TU contraseña real (solo la API lo usa):
node --disable-warning=ExperimentalWarning api/scripts/hash-password.ts 'tu-clave' \
  | npx wrangler secret put PASSWORD_HASH -c api/wrangler.toml
```

Rotar `AUTH_SECRET` invalida todas las sesiones (basta volver a entrar). Si solo
se rota en uno de los dos Workers, el guard y la API dejarán de coincidir: rota
siempre los dos.

Local: `pnpm dev` / `pnpm e2e` generan **dos** `.dev.vars` con el mismo contenido
(`.dev.vars` en la raíz para el frontal y `api/.dev.vars` para la API) — wrangler
los busca junto a cada fichero de configuración. Si falta uno, ese Worker no ve
los secretos: login **500** y todo lo protegido 401.

## 6. Deploy

Con Workers Builds conectado (repo `ifmael/esencial`, branch `main`) hacen falta
**dos builds, uno por Worker**:

| Worker | Root directory | Build command | Deploy command |
| --- | --- | --- | --- |
| `esencial` | `/` | `pnpm build` | `npx wrangler deploy` |
| `esencial-api` | `api/` | *(vacío)* | `npx wrangler deploy` |

- El build del frontal necesita la variable de build
  `VITE_API_URL=https://esencial-api.nutrirutina.workers.dev` (Settings → Build →
  Environment variables), o el SPA quedará llamando a su propio origen.
- Un push a `main` dispara los dos builds: hasta que exista el segundo, el push
  solo publica el frontal.
- `api/wrangler.toml` define el origen del frontal en `[vars] WEB_ORIGIN` y el
  `wrangler.toml` de la raíz define el de la API en `[vars] API_ORIGIN`: si
  cambias de subdominio, actualiza los dos.

Deploy manual (publica los dos):

```bash
pnpm run deploy    # build del SPA con la URL de la API + deploy de ambos Workers
```

El primer deploy crea los Workers y publica:

- Frontal (SPA + guard): https://esencial.nutrirutina.workers.dev
- API: https://esencial-api.nutrirutina.workers.dev

## 7. Verificación post-deploy (2 min)

1. `curl -i https://esencial.<sub>.workers.dev/plan-recetas` sin sesión →
   **302** a `/login?next=%2Fplan-recetas`.
2. `curl https://esencial-api.<sub>.workers.dev/api/health` → **200** `{ ok: true }`.
3. `curl -i .../api/recipes` sin cookie → **401** `{ "error": "Unauthorized" }`.
4. Preflight desde el origen del frontal:
   `curl -i -X OPTIONS .../api/recipes -H 'Origin: https://esencial.<sub>.workers.dev'
   -H 'Access-Control-Request-Method: POST'` → **204** con
   `Access-Control-Allow-Origin` y `Access-Control-Allow-Credentials: true`.
5. Abre la URL del frontal en el navegador → `/login` → entra con tu contraseña →
   el DÍA carga (consola sin errores de CSP/CORS).
6. Una foto de receta y un vídeo de YouTube embebido siguen viéndose.
7. "Cerrar sesión" → vuelve a `/login`; `curl` con la cookie vieja → 401.

## Rollback

`npx wrangler rollback` (frontal) o `npx wrangler rollback -c api/wrangler.toml`
(API) revierten ese Worker a su versión anterior por separado (la BD no se toca).
Los secretos quedan inertes: la versión previa no los lee. Para cerrar el acceso
sin deploy: rota `AUTH_SECRET` — todas las cookies emitidas dejan de verificar.
