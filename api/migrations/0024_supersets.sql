-- 0024: agrupar ejercicios en bloque (superseries, triseries, series gigantes).
-- `superset = 1` en una fila significa «va pegado al siguiente ejercicio»: un
-- bloque son dos o más filas seguidas marcadas y el último va sin marca (y es el
-- único que lleva descansos: el de entre vueltas y el de acabar el bloque).
-- Columna aditiva con defecto 0, así que se puede aplicar antes de desplegar el
-- código nuevo sin romper el viejo.
ALTER TABLE plan_session_exercises ADD COLUMN superset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE template_exercises ADD COLUMN superset INTEGER NOT NULL DEFAULT 0;
