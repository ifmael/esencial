-- 0024: vídeo de técnica (YouTube, en español) de los 17 ejercicios de «Barra
-- Libre» que añadió 0023 — los únicos del catálogo sin `technique_url` (los 91
-- originales lo traen desde 0006, con los arreglos de 0007 y 0008).
--
-- Cada clip se eligió a mano: el título nombra el ejercicio, el canal es
-- hispanohablante y el audio va en español (verificado con `--list-subs`: casi
-- todos traen subtítulos en `es`, y los que no, son canales nativos en español).
-- Con yt-dlp se comprobó además que el vídeo sigue existiendo y que es
-- embebible (`playable_in_embed`), que es lo que rompería el iframe de la ficha.
--
-- Aditiva y de aplicación única vía runner (como 0006): resuelve el ejercicio
-- por nombre, así que un catálogo recortado no la rompe. No va al bootstrap de
-- tests (es siembra, como 0010 y 0023). Un arreglo posterior va en su propio
-- número, nunca reescribiendo esta.
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=I31BobyRSWc' WHERE name = 'Cargada';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=R2ORnt_kLV0' WHERE name = 'Press jabalina';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=67lO1ijZ5Nw' WHERE name = 'Peso muerto unilateral';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=GlCoiR9RoYw' WHERE name = 'Curl a una mano con barra';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=r70FSepsHIY' WHERE name = 'Curl invertido con barra';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=Uy2nUNX38xE' WHERE name = 'Burpee';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=o8naBioenF0' WHERE name = 'Thruster';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=lVBpGzWwHwM' WHERE name = 'Swing con kettlebell';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=94kwmDlWuWQ' WHERE name = 'Arrancada con kettlebell';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=7vGo3Pl9pZ8' WHERE name = 'Remo alto';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=pPvvyyYYl7U' WHERE name = 'Cargada y press';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=e63EKyRdxgo' WHERE name = 'Remo renegado';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=mEaGoM4XVgM' WHERE name = 'Remo invertido';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=_1BeHM0AbPs' WHERE name = 'Dominada con toalla';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=KCuxgziXkZ8' WHERE name = 'Sit-up con barra';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=g5M-496gXjU' WHERE name = 'Flexiones con palmada';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=2Rhse-2btVk' WHERE name = 'Sentadilla en rack con kettlebell';
