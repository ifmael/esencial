-- 0022: alias de búsqueda (aditivo) + nombres españoles canónicos.
--
-- El catálogo nació mezclando idiomas («Farmer carry», «Face pull», «Hip
-- thrust»…) y la búsqueda solo casaba el nombre en un idioma. Aquí se fija el
-- español como nombre canónico, se renombran los que estaban en inglés y se
-- siembran los alias con los que se busca: el nombre inglés (si el ejercicio se
-- conoce por él) y los sinónimos usuales, todo en minúsculas. La UI nunca enseña
-- el alias salvo en la ficha («También conocido como»).
--
-- Qué NO se renombra: los nombres propios («Press Arnold», «Curl en banco
-- Scott», «Remo con barra Pendlay»), los términos ya universales en un gimnasio
-- español («curl», «press», «pullover», «crunch», «crossover») y **«Hip
-- thrust»**: es el nombre con el que se conoce el ejercicio, así que se queda y
-- su alias es la traducción («empuje de cadera»).
--
-- Este renombrado va DESPUÉS de 0006/0007/0008/0010/0011/0013/0015, que
-- referencian ejercicios por su nombre viejo: como esos ya se aplicaron, aquí es
-- seguro. No se reescriben migraciones pasadas.
--
-- Es aditiva: una tabla nueva y unos UPDATE/INSERT sobre el catálogo. Cada alias
-- se inserta resolviendo el ejercicio por nombre, así que un nombre que no
-- exista (por ejemplo un catálogo recortado) no rompe la migración.

CREATE TABLE IF NOT EXISTS exercise_aliases (
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,
  PRIMARY KEY (exercise_id, alias)
);

-- ── Español canónico ─────────────────────────────────────────────────────────
-- Mapeo explícito (nombre viejo → nombre nuevo), idempotente por el WHERE.
UPDATE exercises SET name = 'Tirón a la cara' WHERE name = 'Face pull';
UPDATE exercises SET name = 'Press con impulso' WHERE name = 'Push press';
UPDATE exercises SET name = 'Sentadilla con copa' WHERE name = 'Sentadilla goblet';
UPDATE exercises SET name = 'Sentadilla a una pierna' WHERE name = 'Pistol squat';
UPDATE exercises SET name = 'Curl nórdico' WHERE name = 'Nordic curl';
UPDATE exercises SET name = 'Puente de rana' WHERE name = 'Frog pump';
UPDATE exercises SET name = 'Giro ruso' WHERE name = 'Russian twist';
UPDATE exercises SET name = 'Bicho muerto' WHERE name = 'Dead bug';
UPDATE exercises SET name = 'Perro pájaro' WHERE name = 'Bird dog';
UPDATE exercises SET name = 'Bote hueco' WHERE name = 'Hollow body hold';
UPDATE exercises SET name = 'Escaladores' WHERE name = 'Mountain climbers';
UPDATE exercises SET name = 'Paseo del granjero' WHERE name = 'Farmer carry';

-- ── Alias de búsqueda ────────────────────────────────────────────────────────
-- Una fila por (ejercicio, alias). El SELECT no devuelve filas si el ejercicio
-- no existe y OR IGNORE absorbe una reejecución.
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'bench press' FROM exercises WHERE name = 'Press banca';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'press de banca' FROM exercises WHERE name = 'Press banca';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'incline bench press' FROM exercises WHERE name = 'Press banca inclinado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'press banca inclinada' FROM exercises WHERE name = 'Press banca inclinado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'decline bench press' FROM exercises WHERE name = 'Press banca declinado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'press banca declinada' FROM exercises WHERE name = 'Press banca declinado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'dumbbell press' FROM exercises WHERE name = 'Press con mancuernas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'press plano con mancuernas' FROM exercises WHERE name = 'Press con mancuernas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'incline dumbbell press' FROM exercises WHERE name = 'Press inclinado con mancuernas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'flyes' FROM exercises WHERE name = 'Aperturas con mancuernas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'aperturas' FROM exercises WHERE name = 'Aperturas con mancuernas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'dumbbell fly' FROM exercises WHERE name = 'Aperturas con mancuernas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'crossover' FROM exercises WHERE name = 'Aperturas en polea (crossover)';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'cable crossover' FROM exercises WHERE name = 'Aperturas en polea (crossover)';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'aperturas en polea' FROM exercises WHERE name = 'Aperturas en polea (crossover)';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'dips' FROM exercises WHERE name = 'Fondos en paralelas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'fondos' FROM exercises WHERE name = 'Fondos en paralelas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'push-ups' FROM exercises WHERE name = 'Flexiones';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'push ups' FROM exercises WHERE name = 'Flexiones';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'lagartijas' FROM exercises WHERE name = 'Flexiones';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'dumbbell pullover' FROM exercises WHERE name = 'Pullover con mancuerna';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'machine chest press' FROM exercises WHERE name = 'Press de pecho en máquina';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'press de pecho' FROM exercises WHERE name = 'Press de pecho en máquina';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'pull-ups' FROM exercises WHERE name = 'Dominadas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'pull ups' FROM exercises WHERE name = 'Dominadas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'dominadas pronas' FROM exercises WHERE name = 'Dominadas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'chin-ups' FROM exercises WHERE name = 'Dominadas supinas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'chin ups' FROM exercises WHERE name = 'Dominadas supinas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'dominadas supinadas' FROM exercises WHERE name = 'Dominadas supinas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'barbell row' FROM exercises WHERE name = 'Remo con barra';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'remo' FROM exercises WHERE name = 'Remo con barra';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'pendlay row' FROM exercises WHERE name = 'Remo con barra Pendlay';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'remo pendlay' FROM exercises WHERE name = 'Remo con barra Pendlay';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'one-arm dumbbell row' FROM exercises WHERE name = 'Remo con mancuerna a una mano';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'remo unilateral' FROM exercises WHERE name = 'Remo con mancuerna a una mano';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'seated cable row' FROM exercises WHERE name = 'Remo en polea sentado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'remo en polea' FROM exercises WHERE name = 'Remo en polea sentado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'lat pulldown' FROM exercises WHERE name = 'Jalón al pecho';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'jalón' FROM exercises WHERE name = 'Jalón al pecho';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'deadlift' FROM exercises WHERE name = 'Peso muerto';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'peso muerto convencional' FROM exercises WHERE name = 'Peso muerto';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'cable pullover' FROM exercises WHERE name = 'Pullover en polea';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'machine row' FROM exercises WHERE name = 'Remo en máquina';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'shrugs' FROM exercises WHERE name = 'Encogimientos con barra';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'encogimientos' FROM exercises WHERE name = 'Encogimientos con barra';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'face pull' FROM exercises WHERE name = 'Tirón a la cara';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'face pulls' FROM exercises WHERE name = 'Tirón a la cara';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'overhead press' FROM exercises WHERE name = 'Press militar de pie';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'ohp' FROM exercises WHERE name = 'Press militar de pie';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'press militar' FROM exercises WHERE name = 'Press militar de pie';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'seated shoulder press' FROM exercises WHERE name = 'Press militar sentado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'press militar con mancuernas' FROM exercises WHERE name = 'Press militar sentado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'arnold press' FROM exercises WHERE name = 'Press Arnold';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'lateral raises' FROM exercises WHERE name = 'Elevaciones laterales';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'laterales' FROM exercises WHERE name = 'Elevaciones laterales';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'front raises' FROM exercises WHERE name = 'Elevaciones frontales';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'frontales' FROM exercises WHERE name = 'Elevaciones frontales';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'rear delt fly' FROM exercises WHERE name = 'Pájaros';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'pájaros con mancuernas' FROM exercises WHERE name = 'Pájaros';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'cable lateral raise' FROM exercises WHERE name = 'Elevación lateral en polea';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'seated dumbbell press' FROM exercises WHERE name = 'Press con mancuerna en banco';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'push press' FROM exercises WHERE name = 'Press con impulso';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'barbell curl' FROM exercises WHERE name = 'Curl con barra';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'alternating dumbbell curl' FROM exercises WHERE name = 'Curl con mancuernas alterno';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'curl alterno' FROM exercises WHERE name = 'Curl con mancuernas alterno';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'hammer curl' FROM exercises WHERE name = 'Curl martillo';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'preacher curl' FROM exercises WHERE name = 'Curl en banco Scott';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'curl predicador' FROM exercises WHERE name = 'Curl en banco Scott';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'cable curl' FROM exercises WHERE name = 'Curl en polea';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'concentration curl' FROM exercises WHERE name = 'Curl concentrado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'incline dumbbell curl' FROM exercises WHERE name = 'Curl inclinado con mancuernas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'ez-bar curl' FROM exercises WHERE name = 'Curl con barra Z';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'curl con barra z' FROM exercises WHERE name = 'Curl con barra Z';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'spider curl' FROM exercises WHERE name = 'Curl araña';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'skull crusher' FROM exercises WHERE name = 'Press francés';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'lying triceps extension' FROM exercises WHERE name = 'Press francés';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'extensión con barra tumbado' FROM exercises WHERE name = 'Press francés';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'pushdown' FROM exercises WHERE name = 'Extensión en polea';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'triceps pushdown' FROM exercises WHERE name = 'Extensión en polea';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'close-grip bench press' FROM exercises WHERE name = 'Press cerrado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'press banca agarre estrecho' FROM exercises WHERE name = 'Press cerrado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'overhead triceps extension' FROM exercises WHERE name = 'Extensión sobre cabeza';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'extensión tríceps sobre la cabeza' FROM exercises WHERE name = 'Extensión sobre cabeza';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'kickback' FROM exercises WHERE name = 'Patada de tríceps';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'triceps kickback' FROM exercises WHERE name = 'Patada de tríceps';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'rope pushdown' FROM exercises WHERE name = 'Extensión con cuerda';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'pushdown con cuerda' FROM exercises WHERE name = 'Extensión con cuerda';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'diamond push-up' FROM exercises WHERE name = 'Flexiones diamante';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'bench dips' FROM exercises WHERE name = 'Fondos en banco';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'fondos de tríceps' FROM exercises WHERE name = 'Fondos en banco';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'back squat' FROM exercises WHERE name = 'Sentadilla trasera';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'sentadilla' FROM exercises WHERE name = 'Sentadilla trasera';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'front squat' FROM exercises WHERE name = 'Sentadilla frontal';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'leg press' FROM exercises WHERE name = 'Prensa de pierna';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'leg extension' FROM exercises WHERE name = 'Extensión de cuádriceps';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'desplantes' FROM exercises WHERE name = 'Zancadas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'lunges' FROM exercises WHERE name = 'Zancadas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'bulgarian split squat' FROM exercises WHERE name = 'Sentadilla búlgara';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'goblet squat' FROM exercises WHERE name = 'Sentadilla con copa';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'sentadilla goblet' FROM exercises WHERE name = 'Sentadilla con copa';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'pistol squat' FROM exercises WHERE name = 'Sentadilla a una pierna';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'sentadilla pistol' FROM exercises WHERE name = 'Sentadilla a una pierna';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'jump squat' FROM exercises WHERE name = 'Sentadilla con salto';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'step-up' FROM exercises WHERE name = 'Escalón';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'step up' FROM exercises WHERE name = 'Escalón';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'romanian deadlift' FROM exercises WHERE name = 'Peso muerto rumano';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'rdl' FROM exercises WHERE name = 'Peso muerto rumano';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'lying leg curl' FROM exercises WHERE name = 'Curl femoral tumbado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'seated leg curl' FROM exercises WHERE name = 'Curl femoral sentado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'standing leg curl' FROM exercises WHERE name = 'Curl femoral de pie';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'good morning' FROM exercises WHERE name = 'Buenos días';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'good mornings' FROM exercises WHERE name = 'Buenos días';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'stiff-leg deadlift' FROM exercises WHERE name = 'Peso muerto con piernas rectas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'peso muerto piernas rectas' FROM exercises WHERE name = 'Peso muerto con piernas rectas';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'nordic curl' FROM exercises WHERE name = 'Curl nórdico';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'nordic hamstring curl' FROM exercises WHERE name = 'Curl nórdico';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'empuje de cadera' FROM exercises WHERE name = 'Hip thrust';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'glute bridge' FROM exercises WHERE name = 'Puente de glúteo';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'cable kickback' FROM exercises WHERE name = 'Patada de glúteo en polea';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'patada de glúteo' FROM exercises WHERE name = 'Patada de glúteo en polea';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'hip abduction' FROM exercises WHERE name = 'Abducción de cadera en máquina';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'frog pump' FROM exercises WHERE name = 'Puente de rana';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'calf raise' FROM exercises WHERE name = 'Elevación de gemelos de pie';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'elevación de talones' FROM exercises WHERE name = 'Elevación de gemelos de pie';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'elevación de gemelos' FROM exercises WHERE name = 'Elevación de gemelos de pie';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'seated calf raise' FROM exercises WHERE name = 'Elevación de gemelos sentado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'elevación de talones sentado' FROM exercises WHERE name = 'Elevación de gemelos sentado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'calf press' FROM exercises WHERE name = 'Elevación de gemelos en prensa';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'elevación de talones en prensa' FROM exercises WHERE name = 'Elevación de gemelos en prensa';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'single-leg calf raise' FROM exercises WHERE name = 'Elevación de gemelos a una pierna';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'elevación de talones a una pierna' FROM exercises WHERE name = 'Elevación de gemelos a una pierna';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'plank' FROM exercises WHERE name = 'Plancha';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'plancha abdominal' FROM exercises WHERE name = 'Plancha';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'side plank' FROM exercises WHERE name = 'Plancha lateral';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'crunch' FROM exercises WHERE name = 'Crunch abdominal';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'crunchs' FROM exercises WHERE name = 'Crunch abdominal';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'hanging leg raise' FROM exercises WHERE name = 'Elevación de piernas colgado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'elevación de piernas' FROM exercises WHERE name = 'Elevación de piernas colgado';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'ab wheel' FROM exercises WHERE name = 'Rueda abdominal';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'roll-out' FROM exercises WHERE name = 'Rueda abdominal';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'rollout con barra' FROM exercises WHERE name = 'Rueda abdominal';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'rueda' FROM exercises WHERE name = 'Rueda abdominal';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'russian twist' FROM exercises WHERE name = 'Giro ruso';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'dead bug' FROM exercises WHERE name = 'Bicho muerto';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'bird dog' FROM exercises WHERE name = 'Perro pájaro';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'hollow body hold' FROM exercises WHERE name = 'Bote hueco';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'hollow hold' FROM exercises WHERE name = 'Bote hueco';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'mountain climbers' FROM exercises WHERE name = 'Escaladores';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'escaladores' FROM exercises WHERE name = 'Escaladores';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'abdominales' FROM exercises WHERE name = 'Sit-up';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'sit up' FROM exercises WHERE name = 'Sit-up';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'sit-ups' FROM exercises WHERE name = 'Sit-up';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'heel touches' FROM exercises WHERE name = 'Toque de talones';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'wrist curl' FROM exercises WHERE name = 'Curl de muñeca';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'reverse wrist curl' FROM exercises WHERE name = 'Curl de muñeca inverso';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'farmer carry' FROM exercises WHERE name = 'Paseo del granjero';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'farmer''s walk' FROM exercises WHERE name = 'Paseo del granjero';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'paseo de granjero' FROM exercises WHERE name = 'Paseo del granjero';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'dead hang' FROM exercises WHERE name = 'Dominada con agarre';
INSERT OR IGNORE INTO exercise_aliases (exercise_id, alias)
  SELECT id, 'colgado en barra' FROM exercises WHERE name = 'Dominada con agarre';
