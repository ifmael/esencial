# Tasks: Nueva receta (página dedicada + subida R2)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600–800 (5 created, 7 modified) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | single-pr |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | API uploads: route, binding, validation | Single PR | `pnpm --filter api test uploads` | `pnpm --filter api test` (miniflare local R2) | revert `api/` + `wrangler*.toml` R2 bits; recipes stay photo-less |
| 2 | Página web: route, form, upload helper | Single PR | `pnpm --filter web test` | `pnpm dev` + browser at :8787 | revert `web/` + `app.tsx` route; modal stays edit-only |
| 3 | E2E + verify | Single PR | `pnpm e2e nueva-receta` | `pnpm e2e` (webServer `pnpm dev`, `hola`) | revert `e2e/tests/nueva-receta.spec.ts` |

## Phase 1: API uploads (RED → GREEN)

- [ ] 1.1 RED: Write `api/tests/uploads.test.ts` — UPLOAD 1–5 (png/jpeg/webp, missing file, gif, >5 MB, malformed → 400/413 `{error,field}`, nothing stored), PHOTO 1–3 (bytes + immutable, 401 anon, 404 unknown), RECIPE_CREATE 1–2 (persists `photo_path`; invalid → 400, nothing persisted); run, failing.
- [ ] 1.2 GREEN: `wrangler.toml` + `api/wrangler.test.toml` add `[[r2_buckets]]` binding `PHOTOS` → `esencial-photos`; `api/src/db.ts` Env adds `PHOTOS?: R2Bucket`.
- [ ] 1.3 GREEN: `api/src/api-validation.ts` add `uploadFileSchema` (File, png/jpeg/webp, ≤5 MB).
- [ ] 1.4 GREEN: Create `api/src/routes/uploads.ts` — POST parses `file`, zod-validates, `PHOTOS.put` under key "recipe-<uuid>.<ext>" with bytes and httpMetadata contentType, 200 `{photo_path}`; failures `fail(msg,"file",400|413)`; GET by key → `PHOTOS.get` → bytes + content-type + `Cache-Control: private, max-age=31536000, immutable`; missing → 404 `{error,field:"key"}`.
- [ ] 1.5 GREEN: `api/src/index.ts` mounts the uploads router (route segment "uploads") under the api mount (existing `authGuard`); `api/src/routes/recipes.ts` POST rejects `photo_path` not matching the regex `^recipe-[0-9a-f-]{36}\.(png|jpe?g|webp)$` or absent in `PHOTOS.head` → 400 `{error,field:"photo_path"}`.
- [ ] 1.6 REFACTOR: Dedupe request helpers in `api/tests/uploads.test.ts` against `api/tests/helpers.ts` (read-only), keep suite green.

## Phase 2: Página web (RED → GREEN)

- [ ] 2.1 RED: Web vitest — `uploadPhoto` helper (FormData shape, error envelope throw); `RecipeForm` submit uploads-then-creates with returned `photo_path`; modal edit-only (no create); run, failing.
- [ ] 2.2 GREEN: `web/src/components/recipes/use-recipes.ts` add `uploadPhoto(file)` (FormData → `POST /api/uploads`).
- [ ] 2.3 GREEN: `web/src/components/recipes/recipe-editor.tsx` extract `RecipeForm` (draft, fields, validation, submit); modal = edit-only wrapper; delete blank/create branch.
- [ ] 2.4 GREEN: Create `web/src/routes/nueva-receta.tsx` — full form (name, ingredients, steps, materials, tags, photo input), submit → upload if any → create → navigate to the new recipe detail page.
- [ ] 2.5 GREEN: `web/src/app.tsx` route for the nueva-receta page registered before the recetario detail route; `web/src/routes/recetario.tsx` "+ Nueva receta" navigates there; `Thumb`/detail `<img>` src prefix "api/uploads/" + photo_path.

## Phase 3: E2E + verificación

- [ ] 3.1 RED: Write `e2e/tests/nueva-receta.spec.ts` — PAGE 1 navigate from recetario (read-only); PAGE 2 `setInputFiles` png → create → photo renders; upload-failure banner; PAGE 3 modal edit-only; run, failing.
- [ ] 3.2 GREEN: Fix `web/` and `api/` until the nueva-receta e2e suite passes with `pnpm e2e`.
- [ ] 3.3 Verify: `pnpm test`, full `pnpm e2e`, `pnpm build` all green.
