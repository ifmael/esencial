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

## 3. Aplicar migraciones (cada vez que cambie el esquema)

```bash

# = wrangler d1 migrations apply esencial --remote
# Registra cada archivo de api/migrations/ en _cf_D1_MIGRATIONS y lo ejecuta
# una sola vez (idempotente). El baseline v1 (schema.sql) ya se aplicó antes;
# 0001 es un no-op. Desde E3, los cambios aditivos viven en api/migrations/.
pnpm db:migrate:remote
```

## 4. Deploy

```bash
npm run deploy              # build del SPA + wrangler deploy
```

La primera vez crea el Worker `esencial` y publica: SPA + API en la misma URL
(https://esencial.<tu-subdominio>.workers.dev — la imprime el propio comando).

## 5. Verificación post-deploy (2 min)

1. Abre la URL workers.dev → debe cargar el placeholder DÍA.
2. Navega a `/plan-recetas` (deep link) → debe cargar la SPA.
3. Crea una receta desde la API o espera a E2; recarga: los datos persisten (D1 remoto).

## Rollback

`npx wrangler rollback` revierte el Worker a la versión anterior. La BD no se
toca por el deploy (el esquema es aditivo e idempotente).
