-- E5 ejecución: pasos de ejecución del ejercicio (arreglo JSON de strings)
-- para la sección "Cómo se ejecuta". El contenido del catálogo (pasos y
-- technique_url) se ingesta por nombre en 0006_exercise_steps_data.sql.
-- Apply exactly once via `wrangler d1 migrations apply esencial` (plain
-- ALTER ADD COLUMN is not repeatable) — schema.sql stays the v1 baseline.
ALTER TABLE exercises ADD COLUMN steps TEXT;
