## Exploration: Nueva receta page + R2 photo upload

> Orchestrator resolution appended: per user-fixed decisions, endpoint naming is
> `POST /api/uploads` (multipart, campo `file`) + `GET /api/uploads/:key`, claves
> planas `recipe-<uuid>.<ext>`, binding R2 `PHOTOS`, bucket `esencial-photos`,
> `Cache-Control: immutable` en GET, envelope de error `{error, field}`. La página
> dedicada es `/recetario/nueva`; el modal queda solo para editar.

### Current State

- **API**: `api/src/routes/recipes.ts` — Hono router under `/api/recipes`. `POST /` and `PUT /:id` validate with `zBody(recipeSchema)`. `recipeSchema` (`api/src/api-validation.ts`) already accepts `photo_path: z.string().optional().nullable()` alongside `ingredients[]`, `steps[]`, `materials[]`, `tags[]`. Insert/update writes `photo_path` into the `recipes.photo_path` TEXT column; `api/src/repo.ts` `loadRecipe` reads it back. **No upload endpoint exists** and **no R2 binding** is declared.
- **Storage**: `wrangler.toml` binds `ASSETS` (SPA static) + `DB` (D1). No `r2_buckets` block. `api/src/db.ts` `Env` = `{ DB: D1Database; ASSETS: Fetcher; AUTH_SECRET?; PASSWORD_HASH? }` — no R2 bucket.
- **Web**: SPA React 19 + react-router 7 + Tailwind v4 CSS-first. Routes (`web/src/app.tsx`): `/recetario` (libro) and `/recetario/:id` (detalle). **No `/recetario/nueva` route.** `web/src/routes/recetario.tsx` `RecetarioPage` holds `creating`/`editing` state; "+ Nueva receta" calls `setCreating(true)` → renders `<RecipeEditor>` as a **modal** (`web/src/components/recipes/recipe-editor.tsx`) used for BOTH create and edit. The editor has a `photo_path` text input (URL string), not a file picker.
- **Hook**: `web/src/components/recipes/use-recipes.ts` owns data access against `/api/recipes`; `Recipe`/`RecipeInput` types already carry `photo_path: string | null`. POST/PUT send JSON.
- **e2e**: `e2e/playwright.config.ts` webServer `pnpm dev`, dev password `hola`, base `http://127.0.0.1:8787`, setup → authed projects.

### Affected Areas

- `api/src/routes/uploads.ts` (nuevo) — `POST /api/uploads` (multipart `file` → R2 put → `{photo_path}`) + `GET /api/uploads/:key` (serve con Cache-Control immutable).
- `api/src/db.ts` — `Env` type: add optional `PHOTOS?: R2Bucket`.
- `wrangler.toml` — add `[[r2_buckets]]` block (binding `PHOTOS`, bucket `esencial-photos`).
- `api/src/index.ts` — montar ruta uploads bajo `/api/*`.
- `web/src/app.tsx` — add `/recetario/nueva` route.
- `web/src/routes/recetario.tsx` — "+ Nueva receta" navigates to `/recetario/nueva` instead of opening the modal; modal stays edit-only.
- `web/src/components/recipes/recipe-editor.tsx` — extract reusable form; keep edit path in modal.
- `web/src/components/recipes/use-recipes.ts` — add upload helper (multipart) returning `photo_path`; create POST includes it.
- Tests: `api/tests/` (uploads), web vitest (form/upload helper), `e2e/tests/` (nueva page + photo).

### Approaches

1. **Dedicated page `/recetario/nueva`** (fixed decision) — full-page form, not modal.
   - Pros: room for file input + R2 upload UX; matches user decision; modal stays edit-only.
   - Cons: new route + page code; must extract shared form to avoid duplicating the editor.
   - Effort: Medium.
2. **Modal-only create (rejected)** — contradicts the fixed dedicated-page decision; modal is cramped for photo upload. Effort: Low (rejected).
3. **Upload transport: multipart endpoint vs base64-in-JSON**
   - **Multipart** `POST /api/uploads` with `FormData` file: real file, streaming, R2-native, no giant JSON body, standard. **Recommended.**
   - **Base64-in-JSON**: +33% size, Workers request limits, no streaming (rejected).
4. **Storage: R2 binding vs D1-blob**
   - **R2 binding** `[[r2_buckets]]` + `PHOTOS`: object storage, Workers-native, `photo_path` = key. **Recommended.**
   - **D1-blob**: D1 row-size limits (~2MB), not meant for blobs (rejected).

### Recommendation

- Build the **dedicated `/recetario/nueva` page** (per fixed decision), sharing form logic via a reusable component extracted from `RecipeEditor`.
- **R2 upload via multipart endpoint** `POST /api/uploads` (`FormData`, `file` field) → validate type/size (image/png|jpeg|webp, ≤5MB, fail-closed) → `env.PHOTOS.put(key, body)` with flat key `recipe-<uuid>.<ext>` → return `{ photo_path }`. Store `photo_path` as the R2 object key in the existing `recipes.photo_path` TEXT column — **no SQLite migration needed** (column already exists).
- Serving: authenticated `GET /api/uploads/:key` behind the existing authGuard, `Cache-Control: immutable`; errors use envelope `{error, field}`.
- Add `[[r2_buckets]]` binding `PHOTOS` in `wrangler.toml` + `PHOTOS?: R2Bucket` in `api/src/db.ts` `Env`.

### Risks

- Worker body-size limits on multipart uploads; validate max size (≤5MB) + content-type; fail-closed 4xx.
- Photo access control — R2 objects served through authenticated endpoint only (authGuard), not public buckets.
- Two-step upload-then-create can leave orphan R2 objects if create fails (acceptable MVP ceiling).
- Multipart parsing in Hono (`c.req.parseBody()`); correct field name + 400 on missing/oversize/bad type.
- Env typing + wrangler — missing R2 binding breaks `pnpm dev`; ensure local R2 config for dev and e2e.
- e2e — Playwright `setInputFiles` needs a real file fixture; dev R2 binding must exist locally.
- TDD/regression — existing recipes CRUD tests must keep passing; new upload tests cover validation boundaries.

### Test strategy per layer

- **api (vitest, miniflare)**: new `POST /api/uploads` tests: missing file → 400, wrong content-type → 400, oversize → 413/400, valid file → 200 + `photo_path` + `Cache-Control` immutable en GET; then create recipe with returned `photo_path`.
- **web (vitest)**: extracted form; create submit includes `photo_path` from the upload response; upload-helper error handling.
- **e2e (Playwright)**: navigate `/recetario/nueva`, `setInputFiles`, submit, assert recipe appears in the libro; edit modal still works.

### Ready for Proposal

Yes. Dedicated `/recetario/nueva` page with R2-backed photo upload; `recipeSchema`/DB already support `photo_path`, so no data-model migration; only a new `[[r2_buckets]]` binding + multipart upload endpoint + form extraction + route. Strict TDD: write api upload tests (vitest/miniflare), web form tests, and Playwright e2e for the nueva page. Capability mapping: `openspec/specs/` only contains `e2e-flujos-criticos`, so `recetas` must be written as a **New Capability** (covering both crear-receta-con-foto and subida-de-imagen requirements).
