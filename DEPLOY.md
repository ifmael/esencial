# Deploy — CM1 a Cloudflare (cuenta del usuario)

Requisito: Node 24 (`source ~/.nvm/nvm.sh && nvm use 24.20.0`). Todo desde la raíz del repo.

## 1. Login (una vez)

```bash
npx wrangler login        # abre el navegador; acepta los permisos
```

## 2. Crear la base de datos D1 (una vez)

```bash
npx wrangler d1 create esencial
```

Copia el `database_id` que imprime y pégalo en `api/wrangler.toml`
(reemplaza el placeholder `REPLACE_WITH_DATABASE_ID`).


## 3. Crear el bucket R2 de fotos (una vez)

```bash
npx wrangler r2 bucket create esencial-photos
```

El binding `PHOTOS` de `wrangler.toml` lo requiere; sin este paso el
deploy falla (el bucket no se crea automáticamente).

## 4. Aplicar migraciones (cada vez que cambie el esquema)

```bash

# = wrangler d1 migrations apply esencial --remote
# Registra cada archivo de api/migrations/ en _cf_D1_MIGRATIONS y lo ejecuta
# una sola vez (idempotente). 0001 es el baseline (v1) y bootstrapea una base
# vacía; `api/schema.sql` refleja el estado final; los deltas viven en 0002+.
#
# ⚠️ 0009_fuerza_v2 RECREA las tablas de planificación de fuerza
#    (plan_sessions / workout_logs / set_logs): se pierden las sesiones
#    planificadas y el historial registrado. Ejecutarla justo después del deploy.
pnpm db:migrate:remote
```

## 5. Secretos de acceso (E7 — una vez, y al rotar la contraseña)

```bash
# Clave de firma de sesión (cualquier string ≥32 aleatorios):
openssl rand -base64 24 | npx wrangler secret put AUTH_SECRET
# Digest PBKDF2 de TU contraseña real (el script lo genera y auto-verifica):
node --disable-warning=ExperimentalWarning api/scripts/hash-password.ts 'tu-clave' \
  | npx wrangler secret put PASSWORD_HASH
```

Rotación = repetir los dos comandos anteriores con la nueva clave (dos comandos, sin deploy).
Local: crea `.dev.vars` en la **raíz del repo** (junto a `wrangler.toml`) con los
mismos valores. IMPORTANTE: wrangler lee `.dev.vars` desde la raíz, no desde
`api/`; si lo pones en `api/` el Worker no ve los secretos y login da 500.
Sin secretos, el Worker falla cerrado (500 en login, 401 en todo lo protegido).

## 6. Deploy

Con Workers Builds conectado (repo `ifmael/esencial`, branch `main`): **todo push
a `main` despliega automáticamente** (build + `npx wrangler deploy` en el runner
de Cloudflare). El build y su log se ven en Deployments → View build history.
Rollback: botón "Rollback" del deployment, o `npx wrangler rollback`.

Deploy manual sigue disponible si desconectas Builds:

```bash
npm run deploy              # build del SPA + wrangler deploy
```

La primera vez crea el Worker `esencial` y publica: SPA + API en la misma URL
(https://esencial.<tu-subdominio>.workers.dev — la imprime el propio comando).

## 7. Verificación post-deploy (2 min)

1. `curl -i https://esencial.<sub>.workers.dev/` sin sesión → **302** a `/login?next=%2F`.
2. `curl https://esencial.<sub>.workers.dev/api/health` → **200** `{ ok: true }` (abierto).
3. `curl -i .../api/recipes` sin cookie → **401** `{ "error": "Unauthorized" }`.
4. Abre `/login` en el navegador → entra con tu contraseña → el DÍA carga.
5. Botón "Cerrar sesión" → vuelve a `/login`; `curl` con la cookie vieja → 401 otra vez.

## Rollback

`npx wrangler rollback` revierte el Worker a la versión anterior (la BD no se
toca; el esquema es aditivo e idempotente). Los secretos quedan inerte: la
versión previa no los lee. Para cerrar el acceso sin deploy: rota `AUTH_SECRET`
— todas las cookies emitidas dejan de verificar.
