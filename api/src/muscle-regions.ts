// Sub-regiones musculares: segundo nivel de la taxonomía, más fino que el grupo
// de `exercise_tags`. Espejo del mapa anatómico (`web/src/components/body-map/`),
// sin lado — el músculo es el mismo en izquierda y derecha — y sin la anatomía
// de relleno (cabeza, manos, pies, articulaciones), que se dibuja pero no filtra.
//
// El mapa es la fuente del dibujo y de las etiquetas en español; esta tabla solo
// añade el grupo padre, que es lo que valida la API: una sub-región tiene que
// colgar de un grupo que ya esté entre los tags del ejercicio.
// `api/tests/muscle-regions.test.ts` compara las dos tablas y falla si divergen.
export const MUSCLE_REGION_GROUPS: Record<string, string> = {
  // hombro
  "shoulder-front": "hombro",
  "shoulder-side": "hombro",
  "deltoid-rear": "hombro",
  // pecho
  "chest-upper": "pecho",
  "chest-lower": "pecho",
  // espalda
  "traps-upper": "espalda",
  "traps-mid": "espalda",
  "traps-lower": "espalda",
  "lats-upper": "espalda",
  "lats-mid": "espalda",
  "lats-lower": "espalda",
  spine: "espalda",
  "lower-back-erectors": "espalda",
  "lower-back-ql": "espalda",
  // bíceps
  biceps: "bíceps",
  // tríceps
  "triceps-long": "tríceps",
  "triceps-lateral": "tríceps",
  // antebrazo
  forearm: "antebrazo",
  "forearm-flexors": "antebrazo",
  "forearm-extensors": "antebrazo",
  // core
  "abs-upper": "core",
  "abs-lower": "core",
  "serratus-anterior": "core",
  obliques: "core",
  "hip-flexor": "core",
  // pierna
  quads: "pierna",
  adductors: "pierna",
  "tibialis-anterior": "pierna",
  "hamstrings-medial": "pierna",
  "hamstrings-lateral": "pierna",
  // glúteo
  "gluteus-maximus": "glúteo",
  "gluteus-medius": "glúteo",
  // gemelo
  "calves-gastroc-medial": "gemelo",
  "calves-gastroc-lateral": "gemelo",
  "calves-soleus": "gemelo",
};
