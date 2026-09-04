# Design — E8 ejecución de ejercicios

## D1: `steps` como columna JSON en `exercises` (no tabla)

Las recetas usan `recipe_steps` (tabla con position) porque son editables por el usuario con reordenación. Los ejercicios del catálogo son datos de referencia, la mayoría solo lectura, y el editor muestra un textarea por línea. Una columna TEXT con JSON array (`["Paso 1","Paso 2"]`) cubre el caso con una fracción del código: sin JOIN, sin reorder UI, lectura/escritura en una línea (`JSON.parse`/`JSON.stringify`). Paso a tabla cuando se necesite reordenación o fuentes por ejercicio.

- Migración: `0005_exercise_steps.sql` — `ALTER TABLE exercises ADD COLUMN steps TEXT;` (deltas aditivos viven en 0002+, `schema.sql` sigue siendo el baseline v1).
- Nota de migración D1: aplicar exactamente una vez vía `wrangler d1 migrations apply esencial` (runner en `_cf_D1_MIGRATIONS`); el ALTER no es repetible. Los tests reproducen el orden en `api/tests/helpers.ts` (básico + 0002 + 0003 + 0005).

## D2: contrato API — `steps` opcional, array de strings

- `exerciseSchema`: `steps: z.array(z.string().min(1)).max(40).optional().nullable()` — misma filosofía que `techniqueUrl`: el cliente envía `null` cuando no hay pasos; el servidor persiste `JSON.stringify(input.steps ?? null)`.
- `loadExercise`: `head.steps = JSON.parse(String(head.steps))` si no es null → el GET devuelve array (o null).
- Error field de zod es `steps.1` (ruta del ítem inválido): el editor no lo muestra inline (client-side filtra vacíos); el contrato `{error, field}` se mantiene.

## D3: embed de YouTube en el detalle

- Helper puro `ytEmbedId(url)`: matchea `youtube.com/watch?v=`, `youtube.com/shorts/`, `youtube.com/embed/` y `youtu.be/` con id de 11 chars; devuelve null si no es YouTube.
- Con id → iframe `https://www.youtube.com/embed/<id>` (lazy, aspect-video, title accesible). Sin id → se conserva el botón "Ver técnica" (enlace externo) — que además sirve de salida si el embed está bloqueado.
- No se cambia el validado por URL libre (D4 de E4): "Ver técnica" acepta cualquier URL, el embed solo aplica a YouTube. Patrón de validación client-side explícito para YouTube: fuera de alcance, no pedido.

## D4: ingestión por nombre en 0006

- Los agentes investigan pasos y vídeos por **nombre** (clave UNIQUE); la migración 0006 ejecuta `UPDATE exercises SET steps = '<json>', technique_url = '<url>' WHERE name = '<nombre>';` por ejercicio — sin dependencia de ids (robusto a re-seeds) y aplicada una sola vez por el runner.
- Los datos no-válidos se descartan al generar (pasos <4 párrafos de personas que no aplican, URLs no-YouTube no para technique_url).
- `+ Nuevo ejercicio` con pasos manuales sigue disponible; el catálogo viene precargado.

## D5: headers del Worker vs iframe de YouTube (bug real)

El embed fallaba con "This content is blocked. Contact the site owner to fix
the issue." — dos headers de `securityHeaders` (middleware.ts) lo rompían:

- `Referrer-Policy: same-origin` → el iframe a YouTube llegaba SIN `Referer`;
  el player de YouTube rechaza el origen y bloquea la reproducción.
  Fix: `strict-origin-when-cross-origin` (envía el origen, nunca la ruta).
- `CSP default-src 'self'` sin `frame-src` → el navegador se negaba a cargar
  el frame de youtube.com (cae a default-src). Fix: `frame-src https://www.youtube.com`.

Test: `api/tests/auth-gate.test.ts` (asserts de ambos headers).

## D6: editor — textarea por línea

Un paso por línea, trim + filtro de vacíos al guardar, `null` si no queda nada. Sin lista dinámica ni reordenación (ver D1).
