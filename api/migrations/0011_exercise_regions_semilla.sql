-- Auditoría de las sub-regiones sembradas en `0010_exercise_regions.sql` (91
-- ejercicios, 237 filas): una sola corrección. `0010` se queda congelada como
-- el sembrado histórico; los arreglos van en su propio número.
--
-- `Elevación de gemelos en prensa` era la única de las cuatro variantes de
-- gemelo sin el sóleo, aunque en la prensa las rodillas no se bloquean y el
-- sóleo es plantar flexor en cualquier flexión plantar. Sus hermanas (`de pie` y
-- `a una pierna`) ya lo llevan, así que la fila se quedaba corta.
-- `calves-soleus` cuelga de `gemelo`, tag que el ejercicio ya tiene, así que
-- pasa la validación de la API (400 `{field:'regions'}` en otro caso).
--
-- Aplica una sola vez (runner en _cf_D1_MIGRATIONS). Idempotente vía OR IGNORE.
INSERT OR IGNORE INTO exercise_regions (exercise_id, region) VALUES
  ((SELECT id FROM exercises WHERE name = 'Elevación de gemelos en prensa'), 'calves-soleus');
