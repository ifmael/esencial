# Spec — E4 plan fuerza (traducción de lectura)

> Versión legible del spec oficial (spec.md, en inglés, es el documento válido).

## 1. Pantalla `Plan fuerza` (`/plan-fuerza`)
Título "Plan fuerza", chips de rotación (A→B→C) en el orden que devuelve la API, una tarjeta por plantilla ("A — Empuje", "B — Tirón"…) y botón "+ Nueva plantilla" abajo. Tocar un chip lleva a su tarjeta. Móvil: tarjetas a ancho completo; escritorio: columnas.

- 3 plantillas → 3 chips y 3 tarjetas. Sin plantillas → estado vacío invitando a crear la primera. API caída → tarjeta de error con reintentar (nunca página en blanco).

## 2. Tarjetas expandibles
Tocar la cabecera de una tarjeta despliega sus ejercicios en el orden guardado: nombre + series objetivo (p. ej. "3×8–12"; sin objetivo → solo nombre). Tocar un ejercicio abre su detalle (`/ejercicios/:id`).

- Recoger/expandir no hace ninguna llamada a la red.

## 3. Editor de plantillas (crear + editar)
Formulario con: nombre (obligatorio), índice de rotación (entero ≥ 0) y la lista de ejercicios en modo borrador. Guardar → UNA llamada POST (crear) o PUT (editar) con las posiciones renumeradas; cada fila puede tener series, reps mín. y reps máx. Cancelar → descarta TODO sin llamar a la API. Errores del servidor (nombre repetido, etc.) se muestran junto al campo.

- Cambias el nombre y cancelas → al reabrir, todo intacto.
- Nombre vacío → error de campo, cero llamadas.
- Nombre repetido → "Already exists" en el campo nombre, el borrador no se pierde.

## 4. Filas de ejercicio dentro del editor
Buscador de ejercicios del catálogo (filtro en cliente por nombre y etiqueta, sin red) → tocar añade al final. Quitar filas, reordenar con flechas ↑/↓, y editar series/reps por fila.

- 3 filas, bajas la flecha de la 2ª, guardas → el PUT llega con el orden cambiado, sin duplicados ni huecos.

## 5. Duplicar plantilla
Cada tarjeta ofrece "Duplicar": copia las filas (orden y objetivos) a una plantilla nueva con nombre derivado ("… (copia)", y "(copia 2)" si choca).

## 6. Catálogo de ejercicios (`/ejercicios`)
Título "Ejercicios", buscador, botón "+ Nuevo ejercicio" y tarjetas con nombre + chips de etiquetas, en orden alfabético (el que da la API). El buscador filtra en cliente por nombre y etiqueta.

- Escribes "pecho" → solo "Press banca". Catálogo vacío → estado vacío invitando a crear.

## 7. Detalle de ejercicio (`/ejercicios/:id`)
Volver, nombre, descripción, chips de grupos musculares, cues de ejecución, botón "Ver técnica" (abre la URL en pestaña nueva; solo si hay URL) y acciones: "Añadir a plantilla" (principal), editar (lápiz) y borrar.

- ID inexistente o borrado → tarjeta "no encontrado" con volver; nunca pantalla rota.
- "Añadir a plantilla" → lista tus plantillas; elegir una añade el ejercicio al FINAL de esa plantilla conservando el resto. Sin plantillas → el picker te manda a crearlas, cero llamadas.

## 8. Editor de ejercicio (crear + editar)
Nombre (obligatorio), descripción, cues, URL de técnica (opcional; válida o vacía — sugerencia: YouTube, pero vale cualquiera) y etiquetas (mínimo 1). Guardar → POST/PUT; errores 400 del servidor se pintan junto al campo. Cancelar → nada se guarda.

## 9. Borrado con confirmación
Borrar ejercicio o plantilla pide confirmación → DELETE → la tarjeta desaparece. Si la API lo impide porque está en uso (el ejercicio sale en alguna plantilla), se muestra el mensaje del servidor y el elemento se queda. Cancelar la confirmación → nada cambia.

## 10. Estados
Guardar deshabilita el botón mientras vuela (sin duplicados). Error de red → banner con reintentar conservando el borrador. Estética DESIGN.md: verde #15803D acciones primarias, ámbar pendiente, rojo solo error, táctiles ≥ 44px en móvil.
