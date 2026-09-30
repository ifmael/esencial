# Modelo 3D de los músculos

`muscles.glb.gz` deriva de **BodyParts3D 4.0**, © The Database Center for Life
Science (DBCLS), con licencia **CC BY 4.0**
(https://creativecommons.org/licenses/by/4.0/).

- Base de datos: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- Licencia: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
- Mitsuhashi et al. (2009), BodyParts3D: 3D structure database for anatomical
  concepts. https://doi.org/10.1093/nar/gkn613
- Empaquetado de partida: human-atlas (MIT), que convierte las unidades a
  metros con el eje Y hacia arriba y simplifica cada malla.

Cambios: se conservan solo los músculos y la piel de cabeza, manos y pies; las
mallas se agrupan por las sub-regiones de Esencial y se simplifican; el recto
abdominal se recorta de la aponeurosis del oblicuo externo y el dorsal ancho se
modela como una lámina a partir de la piel, porque el atlas no los trae. Lo
genera `web/scripts/gen-muscle-model.ts`.
