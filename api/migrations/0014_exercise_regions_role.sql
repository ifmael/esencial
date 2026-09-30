-- Grado de implicación de cada músculo en su ejercicio: principal, secundario o
-- estabilizador. Lo que ya había queda como principal; la siembra lo corrige en
-- 0015. Aditiva (ALTER), así que la API vieja sigue leyendo la tabla.
ALTER TABLE exercise_regions
  ADD COLUMN role TEXT NOT NULL DEFAULT 'primary'
  CHECK (role IN ('primary', 'secondary', 'stabilizer'));
