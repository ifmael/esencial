# ADR-0009 — D1 y R2 como estado gestionado de la app

- **Estado:** Aceptada
- **Fecha:** 2026-09-06

## Contexto

La app guarda datos relacionales (usuarios, recetas, planes, registros) y fotos
de receta. El despliegue es Cloudflare y no hay un servidor propio que mantenga
un motor de base de datos o un sistema de ficheros. Había que elegir dónde vive
el estado y cómo se protege.

## Decisión

- **D1** es la base de datos: `api/wrangler.toml` enlaza el binding `DB` a la
  base `esencial`, con `migrations_dir = "migrations"`. Hay una base por entorno
  (producción y preview); el esquema se versiona en `api/migrations/` y el estado
  final vive en `api/schema.sql`. Solo la API toca la base; el Worker del frontal
  no tiene el binding.
- **R2** guarda las fotos: el binding `PHOTOS` apunta a `esencial-photos`. La
  subida y la lectura pasan por `/api/uploads`; el bucket no se sirve como sitio
  público. La clave de la foto se guarda en `photo_path` y el acceso se valida
  contra el usuario y las recetas legibles.

El preview usa una pareja propia (`esencial-preview` y
`esencial-photos-preview`) compartida por todas las previews, nunca los recursos
de producción.

## Alternativas

- **PostgreSQL u otro motor alojado:** da más funciones y escala vertical, pero
  añade un proveedor, una conexión de red y otro juego de credenciales fuera de
  Cloudflare.
- **SQLite en un servidor propio:** evita la dependencia de D1, pero exige
  mantener disco, copias y disponibilidad; el flujo es de un operador y no
  quiere esa carga.
- **Fotos en la base o en un sistema de ficheros:** evita R2, pero mete bytes
  grandes en las consultas o pierde el almacenamiento de objetos y su caché.
- **Bucket R2 público:** simplifica la URL de la foto, pero elimina el control
  de acceso por usuario y receta.

## Consecuencias

- D1 es SQLite: hay límites de consulta y de tamaño, y no tiene `down`; una
  migración aplicada se corrige con otra migración, nunca restaurando la
  anterior.
- El estado queda atado a Cloudflare; una migración de proveedor exigiría
  exportar datos y reescribir el acceso.
- R2 no sustituye una CDN pública: cada foto se sirve a través de la API y con
  identidad.
- Las fotos de preview hay que copiarlas si se recrea el bucket; las recetas sin
  foto caen al monograma.

## Referencias

- `api/wrangler.toml` (bindings `DB` y `PHOTOS`, previews).
- `api/schema.sql`, `api/migrations/` y `DEPLOY.md` §2–4.
- `api/src/routes/uploads.ts` (subida y lectura de R2).
- `AGENTS.md`, «Fotos de recetas (R2)» y «Migraciones».
