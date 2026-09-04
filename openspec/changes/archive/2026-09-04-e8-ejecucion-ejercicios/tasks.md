# Tasks — E8 ejecución de ejercicios

> Stack: `api/` Hono + D1 (wrangler, vitest+vitest-pool-workers), `web/` React 19 + Vite (vitest + testing-library, fetch mocked). Strict TDD: RED (test que falla) → GREEN. Test command: `pnpm test` (api → web).

## 1. Datos de catálogo (paralelo)

- [x] 1.1 Despachar 9 agentes en paralelo: 5 chunks de pasos de ejecución (91 ejercicios del seed) + 4 chunks de vídeos de YouTube (`tmp/ingest/*.json`)
- [x] 1.2 Validar 91/91 names contra `0004_seed_exercises.sql` (exactos, acentos incluidos) y pasos 4-8 no vacíos
- [ ] 1.3 Generar `0006_exercise_steps_data.sql` (UPDATE por nombre) y aplicarla localmente
- [ ] 1.4 Verificar cobertura en D1 local: 91 exercises con steps, technique_url de YouTube (o corregir y re-aplicar)

## 2. Schema (RED → GREEN)

- [x] 2.1 `0005_exercise_steps.sql`: `ALTER TABLE exercises ADD COLUMN steps TEXT` (JSON array); `api/tests/helpers.ts` bootstrap incluye 0005 — RED: suite falla sin migración en el bootstrap
- [x] 2.2 GREEN: bootstrap y esquema aplican; tests existentes verdes

## 3. API steps (RED → GREEN)

- [x] 3.1 RED: `api/tests/exercises.test.ts` — POST con steps → 201 y GET devuelve array; POST con ítem vacío → 400 `field: steps.1`; PUT reemplaza steps
- [x] 3.2 GREEN: `exerciseSchema.steps` (`z.array(z.string().min(1)).max(40).optional().nullable()`), INSERT/UPDATE bind `JSON.stringify(input.steps ?? null)`, `loadExercise` parsea el JSON → 12/12 tests

## 4. Web (RED → GREEN)

- [x] 4.1 `Exercise.steps: string[] | null` + `ExerciseInput.steps?` en `web/src/lib/exercises.ts`; fixtures y `api-mock.ts` actualizados (incl. `plan-fuerza.test.tsx`)
- [x] 4.2 Detalle: sección "Cómo se ejecuta" (ol numerado) cuando hay pasos; iframe `youtube.com/embed/<id>` para URLs de YouTube (watch/shorts/youtu.be); enlace "Ver técnica" conservado; non-YouTube → solo enlace — tests: 13/13
- [x] 4.3 Editor: textarea "Pasos de ejecución" (un paso por línea; vacíos descartados; sin pasos → null) — test de flujo de creación verifica POST body

## 5. Verificar y cerrar

- [x] 5.1 `pnpm test` completo (api + web) verde — api 162/162; web 150/150 (2 unhandled errors pre-existentes en master, no tocados)
- [x] 5.2 Browser smoke (dev): /ejercicios/1 Press banca muestra "Cómo se ejecuta" (8 pasos) + iframe youtube.com/embed/7aQY3u0Dk-Q + botón Ver técnica
- [x] 5.3 Archivar change e8 + actualizar AGENTS.md
- [x] 5.4 BUG REAL (post-e2e): los headers del Worker bloqueaban el embed — `Referrer-Policy: same-origin` (sin Referer → "This content is blocked...") y `CSP default-src 'self'` sin `frame-src` (frame rechazado). Fix en `middleware.ts` (D5); tests `auth-gate.test.ts` actualizados
- [x] 5.5 Verificación de los 91 vídeos (yt-dlp `playable_in_embed`): 90/91 ok; 1 no existía ("Toque de talones" → `0007_exercise_video_fix.sql` con reemplazo `RN7LM6mcPpQ`, verificado en navegador)
- [x] 5.6 Auditoría de idioma de los 91 vídeos (yt-dlp ES ASR + título/canal): solo 2 en inglés (Bird dog, Farmer carry) → `0008_exercise_spanish_videos.sql` con reemplazos de CuídatePlus (Rn0SFzJzhQc, X5ZRWP_AHPw), ambos verificados en navegador
