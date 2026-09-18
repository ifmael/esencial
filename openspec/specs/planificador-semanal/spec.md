# spec.md — planificador-semanal

## ADDED Requirements

### Requirement: La sesión es el día

Una **sesión** SHALL ser el conjunto planificado de un día (`date` único) con un
**nombre** editable y una lista ordenada de ejercicios (fuerza y/o cardio),
sin repetir un mismo ejercicio dentro del día. El nombre vacío se persiste como
`null` y la UI muestra "Sesión".

#### Scenario: Crear la sesión de un día

- **Given** la rejilla semanal con un día sin sesión
- **When** el usuario abre el editor del día, añade ejercicios y guarda
- **Then** se crea la sesión con `POST /api/plan-sessions {date, name?, items}`
  y la celda muestra el nombre y el badge "Pendiente"
- **And** si el día ya tenía sesión, la API responde `409 {"error":"Ya hay una sesión ese día"}`

#### Scenario: Día sin ejercicios

- **Given** el editor del día abierto sin filas
- **When** el usuario intenta guardar
- **Then** el botón Guardar SHALL estar deshabilitado y no se emite ninguna llamada

### Requirement: Plantillas como agrupaciones semánticas

Una **plantilla** SHALL ser una agrupación con nombre de ejercicios con sus
series/reps objetivo (fuerza) o distancia/tiempo (cardio). Las plantillas NO
programan ni rotan: sólo agrupan. Un ejercicio no puede repetirse dentro de la
plantilla (`400 {"error":"Ejercicio duplicado en la plantilla","field":"exercises"}`).

#### Scenario: Plantilla con cardio

- **Given** el editor de plantillas
- **When** el usuario añade un ejercicio de tipo running/bici
- **Then** la fila SHALL ofrecer distancia (km) y tiempo (min) en lugar de series/reps
- **And** el payload SHALL viajar como `{exerciseId, targetDistanceKm, targetDurationMin}`
  y volver en `GET /api/templates/:id`

#### Scenario: Ejercicio de cardio en el catálogo

- **Given** el formulario de ejercicios
- **When** el usuario elige tipo Bici o Running
- **Then** el ejercicio se persiste con `kind` (`strength`|`running`|`bike`) y se
  muestra con su etiqueta en el catálogo y en los pickers

### Requirement: Añadir al día expande las plantillas

Añadir una plantilla a un día SHALL expandir sus ejercicios como filas del día
(copia de sus series/reps/distancia/tiempo) y la plantilla deja de existir como
ente de esa planificación. Los ejercicios ya presentes en el día NO se añaden
otra vez; la fusión es por `exerciseId` (primera aparición gana).

#### Scenario: Dos plantillas con un ejercicio en común

- **Given** un día con la plantilla A expandida (contiene Press banca)
- **When** el usuario añade la plantilla B (también contiene Press banca)
- **Then** el día SHALL contener Press banca UNA sola vez y el resto de ejercicios de B
- **And** el editor SHALL informar de cuántos ejercicios ya estaban en el día

#### Scenario: Ejercicio suelto repetido

- **Given** un día que ya contiene un ejercicio
- **When** el usuario abre el picker de añadir al día
- **Then** esa fila SHALL aparecer deshabilitada como "ya añadido"

#### Scenario: Series por defecto al expandir

- **Given** una entrada de plantilla sin series definidas para un ejercicio de fuerza
- **When** se expande en el día
- **Then** la fila del día SHALL quedar con 3 series (valor explícito y editable)

### Requirement: Editar el día no toca la plantilla

Reemplazar los items del día SHALL usar
`PUT /api/plan-sessions/:id {name?, items}` (sustitución atómica). Las series,
reps mín/máx (o distancia/tiempo) editadas afectan SOLO a ese día.

#### Scenario: PUT cambia series del día

- **Given** una sesión `planned` con un ejercicio de 3 series
- **When** el usuario cambia a 6 series y guarda
- **Then** el `PUT` responde 200 y al reabrir el día el valor persistido es 6
- **And** `GET /api/templates/:id` de la plantilla de origen SHALL seguir mostrando sus series originales

#### Scenario: PUT sobre logged rechazado

- **Given** una sesión con `status='logged'`
- **When** se intenta `PUT /api/plan-sessions/:id`
- **Then** la API responde `409 {"error":"Sesión ya registrada"}`

### Requirement: Dedupe y validación de items

`POST` y `PUT` de la sesión SHALL validar los items antes de escribir:
`exerciseId` repetido o inexistente → `400 {"field":"items"}` con el mensaje
correspondiente; el `UNIQUE (plan_session_id, exercise_id)` de la BD es el backstop.

#### Scenario: Items duplicados en el payload

- **Given** un payload con el mismo `exerciseId` dos veces
- **When** se llama `POST /api/plan-sessions`
- **Then** la API responde `400 {"error":"Ejercicio duplicado en la sesión","field":"items"}`

### Requirement: Rejilla semanal

`/plan-fuerza` SHALL mostrar una rejilla semanal (Lunes→Domingo) con navegación
‹ semana ›, libremente navegable en pasado y futuro, y el día de hoy marcado.

#### Scenario: Celda planned

- **Given** un día con sesión `planned`
- **When** se renderiza la rejilla
- **Then** la celda muestra el nombre, el badge "Pendiente" y la ✕ de desprogramar
  (con confirmación inline)

#### Scenario: Celda logged

- **Given** un día con sesión `logged`
- **When** el usuario pulsa la celda
- **Then** SHALL navegar a `/sesion/:date` en modo solo lectura y no ofrecer ✕

### Requirement: Desprogramar sesión planned

El sistema SHALL permitir desprogramar una sesión `planned` con
`DELETE /api/plan-sessions/:id`.

#### Scenario: DELETE de sesión planned

- **Given** una sesión con `status='planned'`
- **When** se confirma la desprogramación (✕ de la celda o "Eliminar sesión" del editor)
- **Then** la API responde `200 {}` y sus `plan_session_exercises` desaparecen en cascada

#### Scenario: DELETE de sesión logged rechazado

- **Given** una sesión con `status='logged'`
- **When** se intenta `DELETE /api/plan-sessions/:id`
- **Then** la API responde `409 {"error":"Sesión ya registrada"}`

#### Scenario: DELETE de sesión inexistente

- **Given** un id inexistente
- **When** se hace `DELETE /api/plan-sessions/:id`
- **Then** la API responde `404 {"error":"Not found"}`

### Requirement: Ejecución del día con cardio

Cerrar el día SHALL persistir las series de fuerza
(`{planSessionExerciseId, setIndex, weightKg, reps, done}`) y, opcionalmente, las
marcas de cardio (`{planSessionExerciseId, distanceKm?, durationMin?, done}`).

#### Scenario: Cardio hecho sin marcas

- **Given** un día con un ejercicio de cardio planificado
- **When** el usuario marca "Hecho" sin escribir distancia ni tiempo y cierra la sesión
- **Then** el log SHALL guardar `distanceKm: null, durationMin: null, done: true`
- **And** la vista logged SHALL mostrar "Hecho sin marcas"

#### Scenario: Escribir marcas implica hecho

- **Given** el borrador del día con un cardio sin marcar
- **When** el usuario escribe una distancia
- **Then** el cardio SHALL quedar marcado como hecho en el payload

#### Scenario: Cardio sin tocar no viaja

- **Given** un cardio planificado sin marcas ni "Hecho"
- **When** se cierra la sesión
- **Then** el payload SHALL enviar `cardio: []` para ese ejercicio

### Requirement: Referencias fuera de la sesión

El POST de logs SHALL validar que cada `planSessionExerciseId` pertenece a la
sesión de esa fecha y que el tipo coincide (sets → fuerza, cardio → running/bici).

#### Scenario: Set de otra sesión

- **Given** un `planSessionExerciseId` de otro día
- **When** se cierra la sesión
- **Then** la API responde `400 {"field":"sets"}` sin escribir nada

#### Scenario: Cardio con series

- **Given** un `planSessionExerciseId` de cardio enviado dentro de `sets`
- **When** se cierra la sesión
- **Then** la API responde `400 {"field":"sets"}`
