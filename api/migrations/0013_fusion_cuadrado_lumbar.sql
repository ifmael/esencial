-- El cuadrado lumbar (`lower-back-ql`) deja de ser una sub-región: es profundo,
-- no se ve desde fuera, el modelo 3D no lo trae y la siembra no lo usaba. Su
-- zona cuenta como Lumbares (`lower-back-erectors`), del mismo grupo (espalda),
-- así que el invariante región → tag del ejercicio se conserva.
-- Un ejercicio creado a mano con los dos queda con Lumbares una sola vez.
UPDATE OR IGNORE exercise_regions SET region = 'lower-back-erectors' WHERE region = 'lower-back-ql';
DELETE FROM exercise_regions WHERE region = 'lower-back-ql';
