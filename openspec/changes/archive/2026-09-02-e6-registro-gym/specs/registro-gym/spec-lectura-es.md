# Spec — E6 registro gym (traducción de lectura)

> Versión legible del spec oficial (spec.md, en inglés, es el documento válido).

## 1. Ruta del día de fuerza (`/fuerza/{fecha}`)
Pantalla móvil-first (wireframe pantalla-3): cabecera con botón atrás, fecha en español y nombre de la sesión asignada (p. ej. "Empuje A"). Todo usable a 360px, objetivos táctiles ≥44px, etiquetas en español.

- Sin sesión programada ese día → estado vacío con salida, nunca pantalla en blanco.
- Fecha inválida en la URL → estado de error, cero llamadas de escritura.

## 2. Lista de series editable (estado A)
Día `planned`: ejercicios de la plantilla en orden, uno con checkbox por serie objetivo (si `target_sets` es nulo, 3). El nombre del ejercicio es tocable → detalle del ejercicio. Al expandir un ejercicio: por cada serie, stepper de peso (kg) y stepper de reps, editables y etiquetados.

- Mover un stepper → cambia en pantalla, sin red (el borrador es local).

## 3. Prefill con la última sesión
Al cargar, se consulta `GET /api/exercises/{id}/last` por ejercicio. Si hay último valor, los steppers arrancan con él y se ve el texto de ayuda "última: 57.5×8". Si nunca se registró → steppers vacíos, sin ayuda.

- Si el endpoint `last` falla → aviso no bloqueante; el usuario puede registrar igualmente a mano.

## 4. Esfuerzo y nota (nivel de sesión)
Cinco puntos grandes (1–5, "Muy fácil" … "Máximo"), selección única. Nota libre multilínea, opcional. "Cerrar sesión" está deshabilitado hasta elegir esfuerzo.

- Nota en blanco/espacios → se envía null o se omite (nunca `""`).

## 5. Cerrar sesión (POST)
"Cerrar sesión" → `POST /api/workout-logs/{fecha}` con `{effort, note?, sets}` y cada serie como `{templateExerciseId, setIndex, weightKg, reps, done}` (camelCase). 201 → la pantalla pasa a estado B con los valores del servidor. El botón se bloquea mientras vuela la petición (un solo POST aunque pulses dos veces). Error 400 → se muestra el mensaje (con el campo si viene) y el borrador se conserva editable.

## 6. Día registrado = solo lectura (estado B)
Si el día está `logged`, la pantalla se pinta desde `GET /api/workout-logs/{fecha}`: pesos/reps como texto (`—` si nulos), checkboxes sin interacción, puntos de esfuerzo rellenos hasta el valor registrado, nota como texto y badge "Registrado" en cabecera. Sin steppers, sin campo de nota editable, sin botón "Cerrar sesión".

- Dos pestañas abiertas en estado A: la segunda en cerrar recibe 409 → recarga a estado B con los datos persistidos (sin callejón sin salida de error).

## 7. Normalización del contrato de series (deuda E1) — DECIDIDO: ruptura limpia
`setLogSchema` pasa a camelCase completo en la entrada: `templateExerciseId, setIndex, weightKg, reps, done`, coherente con el resto de la API. Los nombres viejos `set_index`/`weight_kg` YA NO se aceptan (sin ventana de compatibilidad): un payload antiguo falla con 400 `{error, field}`. Reglas de validación idénticas a E1. La base de datos NO cambia (columnas snake_case dentro; camelCase solo en el cable) y las respuestas ya eran camelCase. Justificación: el único consumidor era código que aún no existía, y API + SPA se despliegan juntos en el mismo Worker (nunca hay versiones desfasadas conviviendo).

## 8. Estados
Carga: secciones con estados de carga/vacío/error con reintentar. Estética DESIGN.md: verde #15803D primario, ámbar pendiente, rojo solo error.
