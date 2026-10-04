-- Descansos programados por ejercicio (segundos): pausa entre series
-- (rest_secs) y pausa al terminar el ejercicio (rest_after_secs), para el modo
-- interactivo de sesión. Nulos = sin descanso programado. Aditiva: el runner de
-- wrangler la ejecuta una sola vez (ADD COLUMN no es repetible) y el bootstrap
-- de tests la aplica tal cual. Sin punto y coma en los comentarios: el bootstrap
-- de tests parte el fichero por ellos.
ALTER TABLE template_exercises ADD COLUMN rest_secs INTEGER;

ALTER TABLE template_exercises ADD COLUMN rest_after_secs INTEGER;

ALTER TABLE plan_session_exercises ADD COLUMN rest_secs INTEGER;

ALTER TABLE plan_session_exercises ADD COLUMN rest_after_secs INTEGER;
