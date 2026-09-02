# Spec — E3 plan semanal + lista de la compra (traducción de lectura)

> Versión legible del spec oficial (spec.md, en inglés, es el documento válido).
> MUST = obligatorio. Los escenarios usan Dado/Cuando/Entonces.

## 1. Rejilla semanal (`/plan-recetas`)
Pantalla con rejilla 7×3: días Lunes→Domingo × desayuno/almuerzo/cena para la semana ISO seleccionada. En móvil, días por filas; en escritorio, días por columnas. Cada celda táctil ≥44 px, etiquetas en español.

- Con dos huecos guardados (Lunes desayuno, Jueves cena) → esas celdas muestran el nombre de la receta; las otras 19 muestran "+ añadir".
- API caída → tarjeta de error con reintentar (nunca rejilla en blanco).
- Semana sin plan → las 21 celdas vacías con "+ añadir", sin error.

## 2. Navegación de semanas
Se abre la semana actual; botones ‹ › la cambian y la semana queda en la URL (`?week=2026-W36`), así el enlace se comparte y el botón atrás vuelve a la semana anterior. Cruzar de diciembre a enero funciona (semanas ISO).

## 3. Rellenar huecos con el picker
Tocar "+ añadir" abre un selector con las recetas del recetario (`GET /api/recipes`) y búsqueda por nombre en el cliente (sin más red). Elegir una guarda el hueco con `PUT /api/meal-plan/{semana}` enviando TODA la semana (igual que hoy hace la API). Cada hueco relleno ofrece quitar/cambiar sin navegar.

- Eliges "Pollo al horno" en Martes/almuerzo → la celda muestra el nombre y el selector se cierra.
- La API devuelve 400 → la rejilla vuelve al estado del servidor y se ve el error.

## 4. Ir a la receta
Tocar una celda rellena navega al detalle de la receta (`/recetario/{id}`, ruta del E2); miniatura con placeholder hasta que E2 tenga foto. Si la receta guardada en un hueco se borra, el hueco se ve vacío — comportamiento que ya garantiza la API actual.

## 5. Datos: tabla y columna nuevas
Nueva tabla `shopping_items` (huecos manuales por semana: alimento, cantidad, unidad, sección, comprado) y columna `section` (opcional) en `recipe_ingredients`. Se aplican como migración versionada D1 (`api/migrations/` + `wrangler d1 migrations apply`): el runner garantiza que cada archivo se ejecuta UNA vez (en D1 no existe `ADD COLUMN IF NOT EXISTS`, verificado). Los datos existentes se conservan.

## 6. Lista de la compra generada (`GET /api/shopping-list/{semana}`)
La API calcula (sin guardarlo) la suma de ingredientes de las recetas planificadas: misma cantidad y unidad se suman; una receta planificada 2 veces cuenta el doble; cantidad vacía → elemento sin cantidad; agrupado por sección con orden fijo "Frutas y verduras, Carnes, Lácteos, Despensa" (la sección explícita de un ingrediente gana sobre el mapa de palabras clave; sin ambos → "Despensa"). Los elementos manuales se mezclan con su estado "comprado".

- "Ensalada" (tomate 200 g) planificada dos veces → tomate 400 g en "Frutas y verduras".
- Semana válida desconocida → 200 con lista vacía; semana mal formada → 400 con campo `week`.
- Borras una receta planificada → sus ingredientes desaparecen de la lista; los manuales se quedan.

## 7. Elementos manuales (API)
`PUT .../items` reemplaza el conjunto manual de la semana; `GET .../items` lo lee; `PATCH .../items/{id}` cambia solo lo enviado (marcar comprado, editar) y 404 si el id no existe. Entradas inválidas → 400 `{ error, campo }` sin escribir nada.

- Marcas "Pan" como comprado → sigue ahí, marcado.
- `food` vacío → 400 y nada cambia.

## 8. Lista en la UI
Botón fijo "Lista de la compra" abre la lista (móvil: pantalla completa; escritorio: panel lateral/inferior). Secciones con elementos (nombre + cantidad agregada) y checkbox en los manuales (verde = comprado). Al final de cada sección, fila "+ añadir artículo" que guarda el texto libre. Las líneas que vienen de recetas NO llevan checkbox (existen mientras estén planificadas).

## 9. Coherencia con la API existente
Las rutas nuevas van montadas en el mismo Worker bajo `/api/shopping-list`, reutilizan validación Zod y el envelope `{ error, campo? }` de las 13 rutas actuales; el campo opcional `section` no rompe nada de E2 (ausente → NULL).
