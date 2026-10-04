-- 0023: ejercicios de «Barra Libre» que faltaban en el catálogo.
--
-- Fuente: «Barra Libre + Fitness Revolucionario» (243 pp.). Solo traen
-- ejercicios el capítulo 2.3 «Los movimientos» (pp. 60-98), las tablas de
-- sesiones del programa (pp. 163-210) y el Anexo 1 «Método Texas» (pp. 221-227).
-- El inventario se cotejó con el catálogo real y se decidió, por ejercicio, si
-- era una fila nueva o un alias de uno existente (ver AGENTS.md):
--
--  - Alias, por ser el mismo movimiento con otra denominación: «Roll-out con
--    barra» → Rueda abdominal (ya en 0022) y «Rodillas a pecho» → Elevación de
--    piernas colgado.
--  - Fila nueva, por cambiar el movimiento (implemento, posición de carga o
--    unilateralidad): las 17 de abajo. «Squat en rack con kettlebell» entra como
--    fila propia (carga unilateral en rack, distinta de la sentadilla goblet).
--  - Fuera: «Saltos de cuerda», que es cardio (los kind son strength|running|bike).
--
-- Aditiva: filas nuevas + sus tags, regiones (con grado) y alias. No va al
-- bootstrap de tests (siembra, como 0010). Todo resuelve el ejercicio por
-- nombre, así que un catálogo recortado no rompe la migración.
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Cargada', 'Levantamiento explosivo de la barra del suelo a los hombros (power clean).');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Press jabalina', 'Press de hombro unilateral con la barra apoyada en un extremo (landmine).');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Peso muerto unilateral', 'Peso muerto con la barra a un lado y una sola mano.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Curl a una mano con barra', 'Curl de bíceps con la barra sujetada con una sola mano.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Curl invertido con barra', 'Curl con agarre prono, énfasis en el antebrazo.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Burpee', 'Sentadilla, plancha, flexión y salto: un ejercicio global.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Thruster', 'Sentadilla frontal seguida de un press por encima de la cabeza.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Swing con kettlebell', 'Balanceo de la pesa rusa con bisagra de cadera.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Arrancada con kettlebell', 'Subida de la pesa rusa del suelo a la vertical en un solo tiempo.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Remo alto', 'Tirón vertical explosivo hasta la altura del pecho, con trapecios.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Cargada y press', 'Cargada a los hombros seguida de un press militar.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Remo renegado', 'Remo a una mano en posición de plancha con mancuernas.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Remo invertido', 'Remo horizontal colgado de una barra baja (dominada horizontal).');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Dominada con toalla', 'Dominada agarrando una toalla por encima de la barra.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Sit-up con barra', 'Sit-up con la barra por encima de la cabeza (con peso).');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Flexiones con palmada', 'Flexión explosiva con palmada al despegar las manos.');
INSERT OR IGNORE INTO exercises (name, description) VALUES ('Sentadilla en rack con kettlebell', 'Sentadilla con la pesa rusa en posición de rack, a un lado.');

-- ── Grupos musculares (exercise_tags) ────────────────────────────────────────
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'pierna' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'glúteo' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'espalda' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'hombro' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'hombro' FROM exercises WHERE name = 'Press jabalina';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'pecho' FROM exercises WHERE name = 'Press jabalina';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'core' FROM exercises WHERE name = 'Press jabalina';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'pierna' FROM exercises WHERE name = 'Peso muerto unilateral';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'glúteo' FROM exercises WHERE name = 'Peso muerto unilateral';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'espalda' FROM exercises WHERE name = 'Peso muerto unilateral';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'antebrazo' FROM exercises WHERE name = 'Peso muerto unilateral';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'bíceps' FROM exercises WHERE name = 'Curl a una mano con barra';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'antebrazo' FROM exercises WHERE name = 'Curl a una mano con barra';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'antebrazo' FROM exercises WHERE name = 'Curl invertido con barra';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'bíceps' FROM exercises WHERE name = 'Curl invertido con barra';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'pierna' FROM exercises WHERE name = 'Burpee';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'pecho' FROM exercises WHERE name = 'Burpee';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'core' FROM exercises WHERE name = 'Burpee';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'pierna' FROM exercises WHERE name = 'Thruster';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'hombro' FROM exercises WHERE name = 'Thruster';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'glúteo' FROM exercises WHERE name = 'Thruster';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'glúteo' FROM exercises WHERE name = 'Swing con kettlebell';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'pierna' FROM exercises WHERE name = 'Swing con kettlebell';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'espalda' FROM exercises WHERE name = 'Swing con kettlebell';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'core' FROM exercises WHERE name = 'Swing con kettlebell';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'glúteo' FROM exercises WHERE name = 'Arrancada con kettlebell';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'pierna' FROM exercises WHERE name = 'Arrancada con kettlebell';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'hombro' FROM exercises WHERE name = 'Arrancada con kettlebell';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'espalda' FROM exercises WHERE name = 'Arrancada con kettlebell';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'espalda' FROM exercises WHERE name = 'Remo alto';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'hombro' FROM exercises WHERE name = 'Remo alto';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'antebrazo' FROM exercises WHERE name = 'Remo alto';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'pierna' FROM exercises WHERE name = 'Cargada y press';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'hombro' FROM exercises WHERE name = 'Cargada y press';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'espalda' FROM exercises WHERE name = 'Cargada y press';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'espalda' FROM exercises WHERE name = 'Remo renegado';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'core' FROM exercises WHERE name = 'Remo renegado';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'antebrazo' FROM exercises WHERE name = 'Remo renegado';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'espalda' FROM exercises WHERE name = 'Remo invertido';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'bíceps' FROM exercises WHERE name = 'Remo invertido';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'espalda' FROM exercises WHERE name = 'Dominada con toalla';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'antebrazo' FROM exercises WHERE name = 'Dominada con toalla';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'bíceps' FROM exercises WHERE name = 'Dominada con toalla';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'core' FROM exercises WHERE name = 'Sit-up con barra';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'pecho' FROM exercises WHERE name = 'Flexiones con palmada';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'tríceps' FROM exercises WHERE name = 'Flexiones con palmada';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'hombro' FROM exercises WHERE name = 'Flexiones con palmada';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'pierna' FROM exercises WHERE name = 'Sentadilla en rack con kettlebell';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'glúteo' FROM exercises WHERE name = 'Sentadilla en rack con kettlebell';
INSERT OR IGNORE INTO exercise_tags (exercise_id, tag)
  SELECT id, 'core' FROM exercises WHERE name = 'Sentadilla en rack con kettlebell';

-- ── Sub-regiones con su grado (exercise_regions) ─────────────────────────────
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'quads', 'primary' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'gluteus-maximus', 'primary' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'hamstrings-medial', 'secondary' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'traps-upper', 'primary' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'lower-back-erectors', 'secondary' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'shoulder-front', 'secondary' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'shoulder-front', 'primary' FROM exercises WHERE name = 'Press jabalina';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'chest-upper', 'secondary' FROM exercises WHERE name = 'Press jabalina';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'serratus-anterior', 'secondary' FROM exercises WHERE name = 'Press jabalina';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'obliques', 'secondary' FROM exercises WHERE name = 'Press jabalina';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'gluteus-maximus', 'primary' FROM exercises WHERE name = 'Peso muerto unilateral';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'hamstrings-medial', 'primary' FROM exercises WHERE name = 'Peso muerto unilateral';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'quads', 'secondary' FROM exercises WHERE name = 'Peso muerto unilateral';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'lower-back-erectors', 'secondary' FROM exercises WHERE name = 'Peso muerto unilateral';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'forearm', 'primary' FROM exercises WHERE name = 'Peso muerto unilateral';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'biceps', 'primary' FROM exercises WHERE name = 'Curl a una mano con barra';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'forearm', 'secondary' FROM exercises WHERE name = 'Curl a una mano con barra';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'forearm-extensors', 'primary' FROM exercises WHERE name = 'Curl invertido con barra';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'forearm-flexors', 'secondary' FROM exercises WHERE name = 'Curl invertido con barra';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'biceps', 'secondary' FROM exercises WHERE name = 'Curl invertido con barra';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'quads', 'primary' FROM exercises WHERE name = 'Burpee';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'chest-lower', 'secondary' FROM exercises WHERE name = 'Burpee';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'abs-lower', 'secondary' FROM exercises WHERE name = 'Burpee';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'hip-flexor', 'secondary' FROM exercises WHERE name = 'Burpee';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'quads', 'primary' FROM exercises WHERE name = 'Thruster';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'gluteus-maximus', 'primary' FROM exercises WHERE name = 'Thruster';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'shoulder-front', 'primary' FROM exercises WHERE name = 'Thruster';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'shoulder-side', 'secondary' FROM exercises WHERE name = 'Thruster';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'gluteus-maximus', 'primary' FROM exercises WHERE name = 'Swing con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'hamstrings-medial', 'primary' FROM exercises WHERE name = 'Swing con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'lower-back-erectors', 'secondary' FROM exercises WHERE name = 'Swing con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'abs-lower', 'secondary' FROM exercises WHERE name = 'Swing con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'gluteus-maximus', 'primary' FROM exercises WHERE name = 'Arrancada con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'hamstrings-medial', 'primary' FROM exercises WHERE name = 'Arrancada con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'traps-upper', 'secondary' FROM exercises WHERE name = 'Arrancada con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'shoulder-front', 'secondary' FROM exercises WHERE name = 'Arrancada con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'lower-back-erectors', 'secondary' FROM exercises WHERE name = 'Arrancada con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'traps-upper', 'primary' FROM exercises WHERE name = 'Remo alto';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'traps-mid', 'primary' FROM exercises WHERE name = 'Remo alto';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'deltoid-rear', 'secondary' FROM exercises WHERE name = 'Remo alto';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'forearm', 'secondary' FROM exercises WHERE name = 'Remo alto';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'quads', 'primary' FROM exercises WHERE name = 'Cargada y press';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'shoulder-front', 'primary' FROM exercises WHERE name = 'Cargada y press';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'traps-upper', 'secondary' FROM exercises WHERE name = 'Cargada y press';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'lower-back-erectors', 'secondary' FROM exercises WHERE name = 'Cargada y press';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'lats-mid', 'primary' FROM exercises WHERE name = 'Remo renegado';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'obliques', 'primary' FROM exercises WHERE name = 'Remo renegado';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'abs-lower', 'secondary' FROM exercises WHERE name = 'Remo renegado';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'traps-mid', 'secondary' FROM exercises WHERE name = 'Remo renegado';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'forearm', 'secondary' FROM exercises WHERE name = 'Remo renegado';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'lats-mid', 'primary' FROM exercises WHERE name = 'Remo invertido';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'traps-mid', 'primary' FROM exercises WHERE name = 'Remo invertido';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'biceps', 'secondary' FROM exercises WHERE name = 'Remo invertido';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'lats-mid', 'primary' FROM exercises WHERE name = 'Dominada con toalla';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'lats-upper', 'primary' FROM exercises WHERE name = 'Dominada con toalla';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'forearm-flexors', 'primary' FROM exercises WHERE name = 'Dominada con toalla';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'biceps', 'secondary' FROM exercises WHERE name = 'Dominada con toalla';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'abs-upper', 'primary' FROM exercises WHERE name = 'Sit-up con barra';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'abs-lower', 'secondary' FROM exercises WHERE name = 'Sit-up con barra';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'hip-flexor', 'secondary' FROM exercises WHERE name = 'Sit-up con barra';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'chest-lower', 'primary' FROM exercises WHERE name = 'Flexiones con palmada';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'chest-upper', 'secondary' FROM exercises WHERE name = 'Flexiones con palmada';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'triceps-lateral', 'secondary' FROM exercises WHERE name = 'Flexiones con palmada';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'triceps-long', 'secondary' FROM exercises WHERE name = 'Flexiones con palmada';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'shoulder-front', 'secondary' FROM exercises WHERE name = 'Flexiones con palmada';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'quads', 'primary' FROM exercises WHERE name = 'Sentadilla en rack con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'gluteus-maximus', 'primary' FROM exercises WHERE name = 'Sentadilla en rack con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'obliques', 'secondary' FROM exercises WHERE name = 'Sentadilla en rack con kettlebell';
INSERT OR IGNORE INTO exercise_regions (exercise_id, region, role)
  SELECT id, 'abs-lower', 'secondary' FROM exercises WHERE name = 'Sentadilla en rack con kettlebell';

-- ── Alias de búsqueda ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'clean' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'power clean' FROM exercises WHERE name = 'Cargada';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'landmine press' FROM exercises WHERE name = 'Press jabalina';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'press unilateral' FROM exercises WHERE name = 'Press jabalina';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'single-arm deadlift' FROM exercises WHERE name = 'Peso muerto unilateral';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'suitcase deadlift' FROM exercises WHERE name = 'Peso muerto unilateral';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'one-arm barbell curl' FROM exercises WHERE name = 'Curl a una mano con barra';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'curl unilateral' FROM exercises WHERE name = 'Curl a una mano con barra';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'reverse curl' FROM exercises WHERE name = 'Curl invertido con barra';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'burpees' FROM exercises WHERE name = 'Burpee';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'thruster' FROM exercises WHERE name = 'Thruster';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'sentadilla con press' FROM exercises WHERE name = 'Thruster';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'kettlebell swing' FROM exercises WHERE name = 'Swing con kettlebell';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'swing' FROM exercises WHERE name = 'Swing con kettlebell';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'kettlebell snatch' FROM exercises WHERE name = 'Arrancada con kettlebell';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'snatch' FROM exercises WHERE name = 'Arrancada con kettlebell';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'high pull' FROM exercises WHERE name = 'Remo alto';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'clean and press' FROM exercises WHERE name = 'Cargada y press';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'renegade row' FROM exercises WHERE name = 'Remo renegado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'inverted row' FROM exercises WHERE name = 'Remo invertido';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'dominada horizontal' FROM exercises WHERE name = 'Remo invertido';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'towel pull-up' FROM exercises WHERE name = 'Dominada con toalla';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'weighted sit-up' FROM exercises WHERE name = 'Sit-up con barra';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'clap push-up' FROM exercises WHERE name = 'Flexiones con palmada';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'squat en rack' FROM exercises WHERE name = 'Sentadilla en rack con kettlebell';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'kettlebell rack squat' FROM exercises WHERE name = 'Sentadilla en rack con kettlebell';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'rodillas a pecho' FROM exercises WHERE name = 'Elevación de piernas colgado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'rodillas al pecho' FROM exercises WHERE name = 'Elevación de piernas colgado';
