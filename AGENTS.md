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

`api/migrations/0001_baseline.sql` ya no es un no-op: es el baseline (espejo de
`api/schema.sql`) y crea las tablas base. Así `pnpm db:migrate:local` bootstrapea
una base local vacía sin aplicar `schema.sql` a mano.

- `api/schema.sql` y `0001_baseline.sql` son **espejos que se mantienen juntos**;
  los deltas aditivos (`photo_path`, `section`, `recipe_tags`, `shopping_items`)
  viven en `0002`+.
- En remoto no hay nada extra que hacer: el baseline ya está aplicado en la D1 de
  producción (ver `DEPLOY.md`).

### 2. wrangler pide confirmación y cuelga en no-TTY

`wrangler d1 migrations apply` muestra un prompt `(Y/n)` cuando corre en un
terminal interactivo (TTY) y se queda esperando si nadie responde.

**Solución:** invocarlo con stdin no-TTY (omite la confirmación y usa `yes`):

```bash
npx wrangler d1 migrations apply esencial --local < /dev/null
```

O ejecutar desde un entorno CI/script no-interactivo.

### 3. `.dev.vars` en local — ubicación y acceso

wrangler lee `.dev.vars` desde la **raíz del repo** (junto a `wrangler.toml`),
**no** desde `api/`. Si se pone en `api/.dev.vars` el Worker no ve `AUTH_SECRET`/
`PASSWORD_HASH`, y login responde **500** (`fail closed`) y todo lo protegido 401.

- Archivo: `.dev.vars` (raíz), gitignored.
- Contraseña local actual de desarrollo: **`joineer`** (hash PBKDF2 guardado en
  `PASSWORD_HASH`). Para cambiarla:
  `node --disable-warning=ExperimentalWarning api/scripts/hash-password.ts '<nueva>'`
  y actualizar `PASSWORD_HASH` en `.dev.vars`; reinicia `pnpm dev`.

## Catálogo de ejercicios (seed)

`api/migrations/0004_seed_exercises.sql` siembra **91 ejercicios** / **145 tags**
con taxonomía general de grupo muscular: `pecho`, `espalda`, `hombro`, `bíceps`,
`tríceps`, `pierna`, `glúteo`, `core`, `antebrazo`, `gemelo`.
`technique_url` va en `NULL` — añadir los enlaces de YouTube a mano.
