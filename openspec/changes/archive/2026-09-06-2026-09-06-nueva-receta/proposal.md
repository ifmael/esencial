# Proposal: Nueva receta (página dedicada + subida R2)

## Intent

Creation uses the RecipeEditor modal; a photo is only a `photo_path` string — no upload exists. Add create page `/recetario/nueva` with photo upload to R2; the modal becomes edit-only.

## Scope

### In Scope
- Create page `/recetario/nueva` (name, tags, materials, steps, ingredients, photo) via reusable form extracted from RecipeEditor
- `POST /api/uploads` multipart (`file` field): `image/png|jpeg|webp`, ≤5 MB → R2 `esencial-photos`, fail-closed (400, nothing persisted); key `recipe-<uuid>.<ext>`; returns `{ photo_path }`
- `GET /api/uploads/:key` authenticated, `Cache-Control: immutable`; errors use envelope `{error, field}`
- `wrangler.toml`: `[[r2_buckets]]` binding `PHOTOS` → `esencial-photos`; `api/src/db.ts` `Env` adds `PHOTOS?: R2Bucket`
- Create recipe with returned `photo_path`
- Modal edit-only; "Nueva receta" navigates to the page

### Out of Scope
- Editing/cropping, multiple photos, video
- Orphan cleanup, retention, quota
- Image transformations (store originals)
- Other modules (plan, strength, notes)

## Capabilities

### New Capabilities
- `recetas`: crear receta con foto + subida de imagen — upload MUST accept `image/png|jpeg|webp` ≤5 MB and MUST fail closed (400, no object, no recipe) on invalid type/size/malformed; dedicated create page; modal edit-only.

### Modified Capabilities
- None (only `e2e-flujos-criticos` exists; `recetas` is new).

## Approach

Hono `POST /api/uploads` reads multipart via `c.req.parseBody()`, validates type/size via zod (extend `api/src/api-validation.ts`), writes `env.PHOTOS.put('recipe-<uuid>.<ext>', body)`, returns `{ photo_path }`; `GET /api/uploads/:key` serves the object behind authGuard with `Cache-Control: immutable`. SPA create route uploads first, then creates via existing recipes endpoint. `photo_path TEXT` exists — no DDL change. Strict TDD: api upload tests (vitest/miniflare) cover validation boundaries; web tests cover the upload helper; Playwright e2e covers nueva page with `setInputFiles`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `api/src/routes/uploads.ts` | New | POST multipart → R2 + GET serve, fail-closed |
| `api/src/index.ts` | Modified | Mount uploads under `/api/*` |
| `api/src/db.ts` | Modified | `Env`: `PHOTOS?: R2Bucket` |
| `api/src/api-validation.ts` | Modified | Upload schema: png/jpeg/webp, ≤5 MB |
| `wrangler.toml` | Modified | `[[r2_buckets]]`: `PHOTOS` → `esencial-photos` |
| `web/src/app.tsx` | Modified | Route `/recetario/nueva` |
| `web/src/routes/recetario.tsx` | Modified | Button navigates; modal edit-only |
| `web/src/components/recipes/recipe-editor.tsx` | Modified | Extract reusable form; photo field |
| `web/src/components/recipes/use-recipes.ts` | Modified | Upload helper (multipart) |
| `openspec/specs/recetas/spec.md` | New | Spec for `recetas` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|-------------|
| Upload abuse / oversize | Med | Server-side type+size validation, fail-closed 400 |
| Orphan if create fails after upload | Med | Delete on failure; documented ceiling |
| R2 binding missing in dev/local | Med | `wrangler.toml` binding + local config; clear error |
| Photo access control | Med | Serve only via authenticated GET, not public bucket |

## Rollback Plan

Revert feature commits: remove `[[r2_buckets]]`, delete uploads route and create page. `photo_path` stays NULL; recipes render as today. Orphan objects deletable out of band.

## Dependencies

- R2 bucket `esencial-photos` created
- `wrangler.toml` `[[r2_buckets]]` binding (`PHOTOS`) for local and production

## Success Criteria

- [ ] png/jpeg/webp ≤5 MB → `photo_path`; recipe created, photo visible
- [ ] Invalid type/size/malformed → 400/413 `{error, field}`, no object, no recipe
- [ ] GET serves photo with `Cache-Control: immutable`, auth required
- [ ] `/recetario/nueva` creates; modal no longer creates
- [ ] e2e create-with-photo + upload-failure; api/web unit tests pass
