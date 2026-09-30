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

**Antes** de aplicar `0012_recetas_nutrirutina` (recetario de Nutrirutina),
sube sus fotos al R2 de producción (83 objetos, ~2 min; necesita la carpeta de
Nutrirutina en local). Al revés, esas 83 recetas se verían sin foto hasta
subirlas:

```bash
node api/scripts/import-nutrirutina.ts photos ~/projects/nutrirutina --remote
```

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

**0013–0015 (grado de los músculos) se aplican ANTES de hacer merge a `main`.**
Un merge dispara Workers Builds, que publica los dos Workers a la vez y en orden
indeterminado, y la API nueva hace `SELECT region, role`: sin la columna, todo
`GET /api/exercises` daría 500. Son aditivas (la columna tiene DEFAULT), así que
la API vieja convive con ellas. Aun así queda una ventana de minutos, mientras
terminan los dos builds, en la que el frontal y la API pueden no coincidir en el
formato de `regions` (cadenas en el viejo, `{ region, role }` en el nuevo): el
mapa de un ejercicio puede salir vacío hasta recargar.

**0016–0017 (catálogo de alimentos y recetas del libro) también van ANTES del
merge**, por lo mismo: la API nueva hace `LEFT JOIN foods` en cada receta y, sin
la tabla, todo `GET /api/recipes` daría 500. Son seguras con la API vieja: 0016
solo añade una tabla y dos columnas con valor por defecto, y 0017 rellena datos
que la API vieja ignora (la lista de ingredientes cambia, pero sigue siendo
texto, cantidad y unidad).

En local, la config de la API vive en `api/`, así que los scripts llevan
`--persist-to .wrangler/state`: la base de desarrollo sigue en la raíz y no en
`api/.wrangler/state`.

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

Rotar `AUTH_SECRET` invalida todas las sesiones (basta volver a entrar). El
valor actual de `esencial` no se puede leer desde el panel: o reutilizas el que
guardaste, o rotas los dos a la vez. Nunca pongas valores distintos.

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

- El build del frontal **no necesita variable en el panel**: el SPA se construye
  contra `https://esencial-api.nutrirutina.workers.dev` porque esa URL vive en el
  repo, en `web/.env.production` (Vite la embebe en `pnpm build`; una variable de
  entorno real la sobreescribe, que es lo que usan dev y e2e).
- Un push a `main` dispara los dos builds: hasta que exista el segundo, el push
  solo publica el frontal.
- Cloudflare exige que el nombre del Worker del panel coincida con el `name` del
  config en ese root directory, o el build falla: los dos Workers se crean antes
  con el deploy manual (§6), así que al montar cada build solo hay que
  comprobarlo.
- `api/wrangler.toml` define el origen del frontal en `[vars] WEB_ORIGIN` y el
  `wrangler.toml` de la raíz define el de la API en `[vars] API_ORIGIN`: si
  cambias de subdominio, actualiza los dos.

Deploy manual (publica los dos, la API primero):

```bash
pnpm run deploy    # build del SPA con la URL de la API + deploy de la API y del frontal
```

Orden del corte (importa): los secretos de la API, luego la API, y solo entonces
el frontal. El deploy del frontal **reemplaza** el Worker `esencial` (pasa de
monolito a solo-frontal): si se publica antes de que la API esté arriba con sus
secretos, el login de producción se rompe hasta completar el paso de la API. La
URL que usas a diario no cambia: sigue siendo la del frontal.

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
