```yaml
schema: gentle-ai.verify-result/v1
verdict: pass
blockers: 0
critical_findings: 0
requirements: 4/4
scenarios: 13/13
test_command: pnpm test
test_exit_code: 0
build_command: pnpm build
build_exit_code: 0
focus: DEF-6 (render de foto con prefijo /api/uploads/)
fix_verified: web/src/lib/api.ts photoSrc() + Thumb (recetario.tsx) + preview (nueva-receta.tsx)
```

# Verify Report: 2026-09-06-nueva-receta — Ronda 3 (ENFOCADA DEF-6)

- **Fecha**: 2026-09-06 (ronda 3, enfocada en DEF-6; DEF-1/2/3/5 ya validados en ronda 2 y sin re-análisis)
- **Worktree**: `nueva-receta` (`/home/ismael/orca/workspaces/esencial/nueva-receta`)
- **Commit base**: `5a11f3f` + working tree sin commitear (mismo change)
- **Veredicto ronda 3**: **PASS** — DEF-6 corregido y verificado en runtime con navegador real (Chromium headless contra `wrangler dev` con `ESENCIAL_DEV_PASSWORD=hola`).

## 1. Fix de DEF-6 (estado del working tree)

El fix aplica el prefijo `/api/uploads/` en los tres puntos de render, vía el helper `photoSrc` en `web/src/lib/api.ts:61-62`:

```ts
export const photoSrc = (photoPath: string) =>
  photoPath.startsWith("/api/uploads/") ? photoPath : `/api/uploads/${photoPath}`;
```

- `web/src/routes/recetario.tsx:22` — `Thumb` (cubre listado y detalle): `<img src={photoSrc(recipe.photo_path)}>`
- `web/src/routes/nueva-receta.tsx:142` — preview: `<img src={photoSrc(draft.photo_path)}>`
- Sin cambio de datos: la DB sigue guardando la key pelada (correcto según design.md).

## 2. Evidencia runtime (flujo completo, sesión con `hola`)

| Paso | Resultado |
|------|-----------|
| Login con `hola` | ✅ redirige a `/` |
| `/recetario/nueva` | ✅ formulario completo |
| Subir PNG (200×200 azul) | ✅ `POST /api/uploads` OK |
| **Preview** | ✅ `<img src="/api/uploads/recipe-f05cdc7b-bd6c-41a0-83fc-d9d47864d15b.png">`, **`naturalWidth=200`**, `complete=true` |
| Guardar | ✅ 201, navega a `/recetario`, receta en `/recetario/14` |
| **Thumb listado** | ✅ `<img src="/api/uploads/recipe-f05cdc7b-….png">`, **`naturalWidth=200`** (renderizada 297×160 en la card) |
| **Detalle** `/recetario/14` | ✅ `<img src="/api/uploads/recipe-f05cdc7b-….png">`, **`naturalWidth=200`**; screenshot confirma la foto azul visible |

URLs de img renderizadas (DOM real):
- Preview: `/api/uploads/recipe-f05cdc7b-bd6c-41a0-83fc-d9d47864d15b.png`
- Listado y detalle: la misma key de la receta 14.

Las demás recetas con foto del listado (QA ronda2, QA receta fotos) también renderizan con `naturalWidth>0` — el fix es retroactivo para keys ya almacenadas.

## 3. Conclusión

DEF-6 cerrado: preview, Thumb del listado y detalle renderizan la foto subida con el prefijo `/api/uploads/`. Con DEF-1/2/3/5 cerrados en ronda 2, no quedan defectos abiertos de este change (DEF-4 e2e sigue en su tarea aparte). **El change puede marcarse como verificado.**

# Verify Report: 2026-09-06-nueva-receta — Ronda 2

- **Fecha**: 2026-09-06 (ronda 2, tras fixes DEF-1/2/3/5)
- **Worktree**: `nueva-receta` (`/home/ismael/orca/workspaces/esencial/nueva-receta`)
- **Commit base**: `5a11f3f` + working tree con el change sin commitear (mismo estado que ronda 1)
- **Veredicto ronda 2**: **FALLA** — los 4 defectos informados (DEF-1, DEF-2, DEF-3, DEF-5) están **corregidos y verificados**; queda **1 defecto nuevo de render (DEF-6)** que impide ver la foto subida en la UI. DEF-4 (e2e) no revalidado: se atiende en tarea aparte, según instrucción.

## 1. Comandos ejecutados

| Comando | Resultado |
|---------|-----------|
| `pnpm test` (raíz) | ✅ api 174 + web 166 = **340 tests pasan** (14 + 21 ficheros) |
| `pnpm build` | ✅ vite build ok (`dist/assets/index-B0FdF-aW.js` 312 KB) |
| `pnpm dev` con `ESENCIAL_DEV_PASSWORD=hola` | ✅ wrangler dev en `http://localhost:8787`, R2 local `PHOTOS` operativo |

## 2. Re-verificación de defectos ronda 1 (curl + código)

| Defecto | Veredicto | Evidencia |
|---------|-----------|-----------|
| **DEF-1** contrato subida `201 {path}` → `200 {photo_path}` | ✅ **RESUELTO** | `curl POST /api/uploads` (png válido) → **HTTP 200** `{"photo_path":"recipe-7f0038a4-….png"}`. Impl: `api/src/routes/uploads.ts` `return c.json({ photo_path: key })` sin status (200). Tests `api/tests/uploads.test.ts` cubren el contrato. |
| **DEF-2** `photo_path:"evil.png"` se persistía (fail-open) | ✅ **RESUELTO** | `POST /api/recipes {"photo_path":"evil.png"}` → **HTTP 400** `{"error":"photo_path no corresponde a una foto subida","field":"photo_path"}`, **nada persistido** (el único row `evil` en D1 era residuo de ronda 1, borrado). También 400 para key bien-formada ausente en R2 (`recipe-00000000-….png`) y para la ruta completa `/api/uploads/recipe-….png`. Impl: `validPhoto()` (regex `^recipe-[0-9a-f-]{36}\.(png\|jpe?g\|webp)$` + `PHOTOS.head`) en POST y PUT de `api/src/routes/recipes.ts`. |
| **DEF-3** subida desde la UI siempre fallaba (`content-type` forzado) | ✅ **RESUELTO** | `web/src/lib/api.ts` `apiFetch`: si `body instanceof FormData` no fija `content-type` (el navegador pone multipart+boundary). Smoke UI: input `Elegir foto` con PNG → POST `/api/uploads` **200** (visto en log de wrangler), `photo_path` guardado en el draft, preview renderiza `<img>`. |
| **DEF-5** oversize devolvía 400, spec exige 413 | ✅ **RESUELTO** | `curl -F file=@big.png` (6 MB) → **HTTP 413** `{"error":"El archivo supera los 5 MB","field":"file"}`. Impl: `fail("El archivo supera los 5 MB", "file", 413)` en `api/src/routes/uploads.ts`. |
| **DEF-4** e2e stale `recipes.spec.ts:7` | ⏭ **NO REVALIDADO** | Se atiende en la tarea e2e aparte (instrucción del coordinador). |

Checks API de ronda 1 que siguen verdes: gif → 400 `{field:"file"}`; sin campo → 400; anónimo GET foto → 401; key desconocida → 404; receta con foto de subida → 201; `GET /api/uploads/<key>` → 200 `Content-Type: image/png` + `Cache-Control: public, max-age=31536000, immutable`.

## 3. Smoke UI real (Chromium headless contra wrangler dev, sesión con `hola`)

1. `/recetario/nueva` con sesión activa → formulario completo visible. ✅
2. Nombre "Receta Ronda 2", chips `postre` y `sartén` añadidos, ingrediente harina/200/gr. ✅
3. Subir PNG → POST `/api/uploads` 200, draft con `photo_path`. ✅ (DEF-3 cerrado)
4. Guardar → 201, navega a `/recetario`, receta listada. ✅
5. **DEF-6 (NUEVO): la foto no se renderiza en ningún sitio.** `<img src="recipe-….png">` sin el prefijo `/api/uploads/` → petición a `/recipe-….png` (200 SPA-fallback HTML, no imagen) y naturalWidth=0. Afecta a:
   - **Listado** `/recetario`: `Thumb` usa `src={recipe.photo_path}` crudo.
   - **Detalle** `/recetario/12`: `Thumb` ídem.
   - **Preview** en `/recetario/nueva`: `src={draft.photo_path}` crudo.
   - Causa: `tasks.md` 2.5 pedía `Thumb`/detail `<img>` src prefix `"api/uploads/" + photo_path`; `web/src/routes/recetario.tsx:21` y `web/src/routes/nueva-receta.tsx:142` no lo aplican. El server de dev devuelve 200 HTML (fallback SPA) para esas rutas, así que la imagen "carga" rota en silencio.
   - Nota: una receta antigua (creada en ronda 1 con `photo_path="/api/uploads/recipe-….png"` full-path) sí renderiza — pero ese valor ya no es producible: POST con full-path ahora devuelve 400 (fail-closed, correcto), y el upload devuelve la key pelada.

## 4. Defectos abiertos

### DEF-6 — MAYOR: `photo_path` se renderiza sin el prefijo `/api/uploads/` (la foto no se ve)

- **Spec**: RECIPE_CREATE escenario "Create with photo" — "photo renders in `/recetario`"; PAGE "Create from page" — "showing the photo".
- **Impl esperada** (tasks 2.5): `Thumb`/detail `<img>` src = `"api/uploads/" + photo_path`.
- **Real**: `web/src/routes/recetario.tsx:20-21` (`<img src={recipe.photo_path}>`) y `web/src/routes/nueva-receta.tsx:141-142` (`<img src={draft.photo_path}>`) usan la key cruda.
- **Evidencia**: log wrangler — `GET /recipe-459b5cba-….png 200 OK` (fallback HTML, no la imagen); DOM: `naturalWidth=0` para los tres `<img>` de recetas con key; la petición correcta `GET /api/uploads/<key>` devuelve 200 image/png cuando se hace a mano.
- **Fix**: prefijar en render: `<img src={`/api/uploads/${recipe.photo_path}`}>` en `Thumb` (cubre listado + detalle) y en el preview de `nueva-receta.tsx`. Dos puntos, sin cambio de datos: la DB guarda la key (correcto según design.md "photo_path = returned key").

### DEF-4 — TESTS (e2e), no revalidado aquí

Se atiende en la tarea e2e aparte según instrucción del coordinador.

## 5. Cobertura del change (tasks.md)

- Fase 1 (API uploads): completa y verificada en runtime (DEF-1/2/5 cerrados).
- Fase 2 (web): subida y creación OK (DEF-3 cerrado); render de foto roto (DEF-6).
- Fase 3 (E2E): fuera de alcance de esta pasada (tarea e2e aparte).

## 6. Conclusión

Los cuatro defectos de la ronda 1 (DEF-1, DEF-2, DEF-3, DEF-5) están corregidos y verificados con evidencia de runtime: contrato 200 `{photo_path}`, fail-closed en `photo_path`, subida multipart desde la UI operativa y 413 en oversize. Queda un defecto nuevo de render (DEF-6): la foto se sube y se sirve correctamente por la API, pero la UI la referencia sin el prefijo `/api/uploads/`, así que el usuario no ve ninguna foto en preview, listado ni detalle. **No marcar el change como verificado hasta corregir DEF-6** (dos puntos de render); DEF-4 se pista en su tarea e2e.
