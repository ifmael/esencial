# Archive Report: 2026-09-06-nueva-receta

- **Fecha**: 2026-09-06
- **Worktree**: `nueva-receta` (`/home/ismael/orca/workspaces/esencial/nueva-receta`)
- **Veredicto de verify (ronda 3)**: **PASS** — 4/4 requirements, 13/13 escenarios, `pnpm test` 0 (api 174, web 166), `pnpm build` 0.

## Qué se archivó

1. **Carpeta del change** movida a `openspec/changes/archive/2026-09-06-2026-09-06-nueva-receta/`
   (proposal, exploration, design, delta spec, tasks, verify-report, state.yaml en `phase: archived`).
2. **Delta spec promovido verbatim** a main spec `openspec/specs/recetas/spec.md`
   (capacidad nueva: 4 requirements — UPLOAD, PHOTO, RECIPE_CREATE, PAGE — 13 scenarios).
   El título del delta (`# Spec: recetas`) se mantiene; misma convención que el archive de
   e2e-flujos-criticos.

## Commits de la unidad (rama `ifmael/nueva-receta`)

| Commit | Contenido |
|--------|-----------|
| `2e37392` | test(api): uploads RED |
| `a8ccc70` | feat(api): subir fotos de receta a R2 |
| `790ceb7` | test(web): pagina nueva receta |
| `4eee722` | feat(web): pagina nueva receta con foto R2 |
| `dd5cc51` | test(e2e): flujo nueva receta |
| `85d474b` | chore: fixtures mock 200 {photo_path} + config openspec |
| `e9ec043` + `51cc503` | docs: registro SDD (openspec change) + AGENTS.md |

## Contratos que quedan en el repo (memoria operativa)

- `POST /api/uploads` multipart `file` (png/jpeg/webp ≤ 5 MB) → `200 {photo_path}`,
  key R2 `recipe-<uuid>.<ext>` en bucket `esencial-photos` (binding `PHOTOS`).
- `GET /api/uploads/:key` tras authGuard, `Cache-Control: immutable`, 404 `{error, field}`.
- `photo_path` fail-closed en `POST/PUT /api/recipes` (regex + `PHOTOS.head`).
- Render web vía `photoSrc()` (`web/src/lib/api.ts`).
- Password dev/e2e: `hola` (`ESENCIAL_DEV_PASSWORD=hola pnpm dev`).
