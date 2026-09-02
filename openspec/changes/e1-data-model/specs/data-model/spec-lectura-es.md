# Spec — E1 modelo de datos + API (traducción de lectura)

> Versión legible en español del spec oficial (en inglés, `spec.md`).
> MUST = obligatorio. Los escenarios usan Dado/Cuando/Entonces.

## 1. Arranque de la base de datos

La app tendrá UN único helper de conexión SQLite (`lib/db.ts`) que crea `data/esencial.db` en modo WAL y aplica el esquema de forma idempotente en el primer uso. Solo `app/api/**` y este helper pueden tocar la base de datos.

- **Dado** un checkout nuevo con `data/` vacío, **cuando** se llama a cualquier ruta API, **entonces** existe `data/esencial.db` con todas las tablas creadas.
- **Dada** una BD que ya existe, **cuando** la app se reinicia, **entonces** los datos se conservan y aplicar el esquema no hace nada.

## 2. Recetas

Cada receta guarda: nombre (único), descripción, raciones, ingredientes por ración (alimento, cantidad, unidad), pasos numerados y materiales/utensilios opcionales (chips).

- **Dada** una receta con 3 ingredientes y 4 pasos, **cuando** haces GET `/api/recipes/{id}`, **entonces** los ingredientes vienen en el orden en que se metieron y los pasos numerados 1..4.
- **Dado** un POST `/api/recipes` sin nombre, **entonces** la API responde 400 con el campo del error y no se escribe nada.

## 3. Catálogo de ejercicios

Cada ejercicio guarda: nombre (único), etiquetas de grupo muscular (una o más), descripción, notas de preparación y URL técnica opcional (YouTube).

- **Dado** "Press banca" con etiquetas [pecho, tríceps], **cuando** GET `/api/exercises?tag=pecho`, **entonces** aparece; un tag desconocido devuelve lista vacía, no un error.

## 4. Plantillas de sesión (plan de fuerza)

Plantillas con nombre (p. ej. "A — Empuje"), lista ORDENADA de ejercicios con series objetivo y rango de repeticiones, y orden de rotación definido por ti (A→B→C).

- **Dada** la plantilla "A — Empuje" con 4 ejercicios, **cuando** GET `/api/templates`, **entonces** los ejercicios vienen en su orden con series/repeticiones objetivo.
- **Dado** que reordenas ejercicios y guardas con PUT, **entonces** los GET siguientes respetan el nuevo orden.

## 5. Plan semanal de comidas

Por semana ISO, hasta 3 huecos por día (desayuno/almuerzo/cena); cada hueco referencia una receta.

- **Dada** la semana 2026-W36, **cuando** PUT `/api/meal-plan/2026-W36` con {día: lunes, comida: cena, recetaId: 7}, **entonces** el GET devuelve ese hueco con el nombre de la receta.
- **Dado** un hueco cuya receta fue borrada, **cuando** lees el plan, **entonces** el hueco aparece vacío (nada se rompe).

## 6. Sesiones programadas y registro de entrenamiento

Programas una plantilla en una fecha. Al pulsar "Cerrar sesión" se guarda UN registro con: cada serie (kg, reps, hecha ✔), esfuerzo percibido 1–5 y nota libre. El día registrado queda SOLO LECTURA.

- **Dado** "Empuje A" programado el 2026-09-03, **cuando** cierras con 12 series y esfuerzo 3, **entonces** GET `/api/workout-logs/2026-09-03` devuelve el registro completo en solo lectura.
- **Dado** un día ya registrado, **cuando** intentas registrarlo otra vez, **entonces** la API responde 409 y el primer registro queda intacto.
- **Dado** que en la última sesión hiciste 57,5 kg × 8 en un ejercicio, **cuando** empieces otra sesión de ese ejercicio, **entonces** la API puede devolver esos "últimos valores" (la UI que los muestra llega en E6).

## 7. Notas del día

Nota/reflexión de texto libre por fecha (una nota editable por día).

- **Dada** una nota guardada el 2026-09-02, **cuando** GET `/api/notes/2026-09-02`, **entonces** se devuelve su texto; guardar de nuevo lo reemplaza.

## 8. Contrato de la API (todas las rutas)

JSON de entrada/salida · validación estricta con Zod (entrada inválida → 400, nada se escribe) · error de BD → 500 con mensaje genérico · formato de error `{ error, campo? }`.

- **Dado** un POST con JSON malformado, **entonces** 400 `{ error, campo }` y no se escribe nada.
- **Dado** un fallo inesperado de BD, **entonces** 500 `{ error }` sin filtrar detalles internos de SQL.
