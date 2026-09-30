-- Catálogo de alimentos para calcular macros. Valores por 100 g (o 100 ml).
-- grams_per_unit convierte la unidad «ud» a gramos (NULL = no se sabe).
-- Aditivo: el runner de wrangler la ejecuta una sola vez (ADD COLUMN no es
-- repetible). Se siembra en 0014. Sin punto y coma en los comentarios: el
-- bootstrap de tests parte el fichero por ellos.
CREATE TABLE IF NOT EXISTS foods (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  kcal           REAL NOT NULL,
  protein        REAL NOT NULL,
  fat            REAL NOT NULL,
  carbs          REAL NOT NULL,
  grams_per_unit REAL
);

ALTER TABLE recipe_ingredients ADD COLUMN food_id INTEGER REFERENCES foods(id);

ALTER TABLE recipe_ingredients ADD COLUMN optional INTEGER NOT NULL DEFAULT 0;
