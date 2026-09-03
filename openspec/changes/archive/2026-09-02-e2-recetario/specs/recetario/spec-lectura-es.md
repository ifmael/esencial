# Spec — E2 recetario (traducción de lectura)

> Versión legible del spec oficial (spec.md, en inglés, es el documento válido). Stack: Worker de Cloudflare (API Hono en `/api/*`) + SPA React servida como assets; datos en D1.

## 1. Libro de recetas (`/recetario`)
Pantalla con título "Recetario", campo de búsqueda y botón "+ Nueva receta". Tarjetas con foto (placeholder si no hay), nombre y chips de etiquetas: rejilla en escritorio, lista de tarjetas horizontales en móvil. Tocar tarjeta → detalle (`/recetario/id`). Los datos llegan de `GET /api/recipes` (mismo origen).

- Con 3 recetas → 3 tarjetas (con estado de carga mientras llega la lista). Sin recetas → estado vacío invitando a crear la primera. API caída → tarjeta de error con reintentar (nunca página en blanco).

## 2. Búsqueda
Filtra en el cliente (sin red) por nombre (sin mayúsculas/minúsculas) y por etiqueta.

- Escribes "arroz" → solo "Arroz con pollo". Borras el texto → vuelven todas.

## 3. Detalle de receta
Ruta `/recetario/:id`: foto o placeholder, nombre, descripción, raciones, ingredientes como checklist con cantidad + unidad, pasos numerados en orden, chips de materiales y etiquetas. Lápiz → editor en modo edición.

- 3 ingredientes y 4 pasos → se muestran en el orden en que se guardaron (1..4).
- ID inexistente por enlace directo → mensaje "no encontrada" con vuelta al libro; nunca página en blanco.
- Editar solo guarda al pulsar Guardar; los cambios no persisten por su cuenta.

## 4. Editor (crear + editar)
Formulario en modal: nombre (obligatorio), descripción, raciones (≥1), foto opcional (URL/ruta de texto), filas dinámicas de ingrediente (alimento + cantidad + unidad; añadir/quitar), pasos ordenados (añadir/quitar/reordenar), chips de materiales, etiquetas libres. Guardar → POST (crear) o PUT (editar; reemplaza ingredientes, pasos, materiales y etiquetas por completo); error 400 `{error, field}` (incluido nombre repetido) → mensaje junto al campo. Cancelar → descarta TODO sin llamar a la API.

- Crear "Tortilla" con 2 ingredientes → tarjeta nueva en el libro y formulario cerrado.
- Nombre vacío → error de campo, cero llamadas a la API.
- Nombre ya existente → el error del servidor aparece junto al nombre y lo escrito se conserva.
- Editas un paso y cancelas → al reabrir, todo intacto.

## 5. Borrado
El detalle ofrece borrar con confirmación. Al confirmar → DELETE (204) y la tarjeta desaparece del libro con un aviso breve de éxito. Al cancelar → nada cambia.

## 6. Foto y etiquetas (delta de datos)
La API acepta y devuelve `photo_path` (texto opcional) y `tags` (lista de texto), guardados en D1 de forma aditiva (columna en `recipes` + tabla `recipe_tags` que se borra en cascada). Las recetas antiguas sin estos campos siguen funcionando igual.

- Crear con foto y tags → al relista o al abrir, salen idénticos. PUT con otras tags → solo quedan las nuevas.

## 7. Estados
Guardar deshabilita el botón mientras vuela (sin recetas duplicadas). Error de red → banner con reintentar conservando lo escrito. Estética DESIGN.md: verde #15803D acciones primarias, ámbar pendiente, rojo solo error.
