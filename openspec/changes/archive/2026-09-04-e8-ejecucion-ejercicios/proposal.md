# Proposal — E8 ejecución de ejercicios: pasos + vídeo de técnica

## Why

El detalle del ejercicio (E4) muestra nombre, descripción, claves de preparación y un enlace "Ver técnica" — pero nada de *cómo ejecutar* el ejercicio. El usuario quiere una sección con los pasos de ejecución y el vídeo de YouTube empotrado.

## What Changes

- **Schema**: `exercises.steps TEXT` (arreglo JSON de strings) en migración 0005. `technique_url` ya existe (NULL) — ahora se rellena con vídeos de YouTube.
- **API**: `steps` opcional/nullable en `exerciseSchema` (array de strings no vacíos, máx. 40), persistido como JSON en POST/PUT y devuelto como array en GET (`loadExercise`).
- **Web detalle** (`/ejercicios/:id`): sección "Cómo se ejecuta" (lista ordenada numerada) cuando hay pasos; iframe empotrado de YouTube cuando `techniqueUrl` es de YouTube (watch/shorts/youtu.be); el botón "Ver técnica" se conserva como fallback y para URLs no-YouTube.
- **Editor**: textarea "Pasos de ejecución" (un paso por línea; líneas vacías se descartan; sin líneas → null).
- **Datos**: investigación de los 91 ejercicios del seed (pasos + vídeos) ingestada por nombre en migración 0006 (idempotente vía runner `_cf_D1_MIGRATIONS`).

## Scope

- Files: `api/migrations/0005_exercise_steps.sql`, `api/migrations/0006_exercise_steps_data.sql` (generada al cerrar), `api/src/{api-validation,repo,routes/exercises}.ts`, `api/tests/{helpers,exercises.test}.ts`, `web/src/{lib/exercises,routes/ejercicios}.tsx`, `web/tests/{api-mock,ejercicios,plan-fuerza}.test.*`.
- Non-goals: fotos/ilustraciones, definir series/reps por ejercicio (eso vive en plantillas), i18n, validación de embeddability (algunos vídeos pueden tener embeds deshabilitados), datos de producción más allá de la migración 0006.

## Risks

- Los vídeos de YouTube podrían no ser embeddables (el canal los bloquea): el iframe muestra el error nativo de YouTube; el botón "Ver técnica" sigue disponible como alternativa. Aceptado.
- 0006 llega con datos investigados: calidad sujeta a los resultados de búsqueda; revisables/editables desde el editor de la app.
- Migración remota (D1 de producción): aplicar con `pnpm db:migrate:remote` antes del deploy; esquema aditivo e idempotente (0001-0006).

## Decision

Aprobar para implementar (pasos con agentes en paralelo, ingest por nombre).
