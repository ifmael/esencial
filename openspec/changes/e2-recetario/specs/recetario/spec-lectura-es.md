# Spec — E2 recetario (traducción de lectura)

> Versión legible del spec oficial (spec.md, en inglés, es el documento válido).

## 1. Libro de recetas (`/plan-recetas`)
Pantalla con título "Recetario", campo de búsqueda y botón "+ Nueva receta". Tarjetas con foto (placeholder si no hay), nombre y chips de etiquetas: rejilla en escritorio, lista en móvil. Tocar tarjeta → detalle.

- Con 3 recetas → 3 tarjetas. Sin recetas → estado vacío invitando a crear la primera. API caída → tarjeta de error con reintentar (nunca página en blanco).

## 2. Búsqueda
Filtra en el cliente (sin red) por nombre (sin mayúsculas/minúsculas) y por etiqueta.

- Escribes "arroz" → solo "Arroz con pollo". Borras el texto → vuelven todas.

## 3. Detalle de receta
Foto o placeholder, nombre, descripción, raciones, ingredientes como checklist con cantidad + unidad, pasos numerados en orden, chips de materiales. Lápiz → editor en modo edición.

- 3 ingredientes y 4 pasos → se muestran en el orden en que se guardaron (1..4).
- Editar solo guarda al pulsar Guardar; los cambios no persisten por su cuenta.

## 4. Editor (crear + editar)
Formulario: nombre (obligatorio), descripción, raciones (≥1), filas dinámicas de ingrediente (alimento + cantidad + unidad; añadir/quitar), pasos ordenados (añadir/quitar/reordenar), chips de materiales, etiquetas libres. Guardar → POST (crear) o PUT (editar); error 400 → mensaje junto al campo. Cancelar → descarta TODO sin llamar a la API.

- Crear "Tortilla" con 2 ingredientes → tarjeta nueva en el libro y formulario cerrado.
- Nombre vacío → error de campo, cero llamadas a la API.
- Editas un paso y cancelas → al reabrir, todo intacto.

## 5. Borrado
El detalle ofrece borrar con confirmación. Al confirmar → DELETE y la tarjeta desaparece. Al cancelar → nada cambia.

## 6. Estados
Guardar deshabilita el botón mientras vuela (sin recetas duplicadas). Error de red → banner con reintentar conservando lo escrito. Estética DESIGN.md: verde #15803D acciones primarias, ámbar pendiente, rojo solo error.
