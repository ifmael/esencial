-- 0025: la métrica de registro de cada ejercicio (aditiva).
--
-- El registro de fuerza nació asumiendo «kilos × repeticiones», pero el catálogo
-- tiene ejercicios que no encajan: los isométricos se aguantan en segundos
-- (Plancha, Bote hueco, la colgar de la barra), el peso corporal no tiene kilos
-- que anotar (Flexiones, Rueda abdominal…) y el paseo del granjero se mide en
-- kilos + segundos. `metric` declara la unidad de la serie:
--
--   weight_reps  kg × repeticiones (el caso normal; también los que admiten
--                lastre o implemento: dominadas/fondos con cinturón, discos…)
--   reps         repeticiones sin peso (el peso corporal es la carga y no hay
--                un implemento de uso habitual; el cargado tiene fila propia,
--                como «Sit-up con barra» frente a «Sit-up»)
--   time         segundos (isométricos y aguantes)
--   weight_time  kilos + segundos (paseo del granjero)
--
-- Aditiva: la columna de `exercises` nace con valor por defecto y `set_logs`
-- admite nulos, así que se puede aplicar antes del merge sin romper al código
-- desplegado (que ignora ambas). El renombrado de 0022 ya pasó, así que los
-- UPDATE van por el nombre canónico. Sin `;` en los comentarios (el bootstrap
-- de tests parte algunos ficheros por ellos).
ALTER TABLE exercises ADD COLUMN metric TEXT NOT NULL DEFAULT 'weight_reps';

-- Series medidas en segundos (isométricos y aguantes); nulo en el resto.
ALTER TABLE set_logs ADD COLUMN duration_secs INTEGER;

-- ── Isométricos y aguantes: segundos ─────────────────────────────────────────
UPDATE exercises SET metric = 'time'
  WHERE name IN ('Plancha', 'Plancha lateral', 'Bote hueco', 'Dominada con agarre');

-- ── Peso corporal: repeticiones sin kilos ────────────────────────────────────
UPDATE exercises SET metric = 'reps'
  WHERE name IN (
    'Flexiones', 'Flexiones diamante', 'Flexiones con palmada', 'Remo invertido',
    'Rueda abdominal', 'Crunch abdominal', 'Sit-up', 'Toque de talones',
    'Escaladores', 'Bicho muerto', 'Perro pájaro', 'Puente de rana',
    'Puente de glúteo', 'Burpee', 'Sentadilla con salto', 'Curl nórdico'
  );

-- ── Carga caminando: kilos + segundos ────────────────────────────────────────
UPDATE exercises SET metric = 'weight_time' WHERE name = 'Paseo del granjero';
