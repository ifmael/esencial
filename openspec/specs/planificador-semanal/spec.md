# spec.md — planificador-semanal

## ADDED Requirements

### Requirement: Rejilla semanal de fuerza

`/plan-fuerza` SHALL mostrar una rejilla semanal (Lunes→Domingo, una fila de
sesiones) como única superficie de programación, con navegación ‹ semana ›.

#### Scenario: Añadir plantilla a un día

- **Given** la semana visible con un día sin sesión
- **When** el usuario selecciona una plantilla en el picker de la celda
- **Then** se crea la sesión (`POST /api/plan-sessions`) y la celda muestra el
  badge "Pendiente"
- **And** si el día ya tenía sesión, la API responde 409 y la rejilla muestra
  "Ya hay una sesión ese día"

#### Scenario: Hoy marcado

- **Given** la semana en curso
- **When** se renderiza la rejilla
- **Then** la celda del día de hoy SHALL estar visualmente marcada

#### Scenario: Navegación de semanas

- **Given** la rejilla visible
- **When** el usuario navega ‹ o ›
- **Then** la rejilla SHALL mostrar la semana ISO anterior/siguiente, libremente
  navegable en pasado y futuro

### Requirement: Desprogramar sesión planned

El sistema SHALL permitir desprogramar una sesión `planned` con
`DELETE /api/plan-sessions/:id`.

#### Scenario: DELETE de sesión planned

- **Given** una sesión con `status='planned'`
- **When** se confirma la desprogramación con la ✕ de la celda
- **Then** la API responde `200 {}`, la celda vuelve a vacía
- **And** la ✕ SHALL pedir confirmación inline antes de llamar al DELETE

#### Scenario: DELETE de sesión logged rechazado

- **Given** una sesión con `status='logged'`
- **When** se intenta `DELETE /api/plan-sessions/:id`
- **Then** la API responde `409 {"error":"Sesión ya registrada"}`

#### Scenario: DELETE de sesión inexistente

- **Given** un id inexistente
- **When** se hace `DELETE /api/plan-sessions/:id`
- **Then** la API responde `404 {"error":"Not found"}`

### Requirement: Celdas logged intocables

Una sesión `logged` SHALL ser solo lectura en la rejilla.

#### Scenario: Badge Hecho

- **Given** una semana con una sesión `logged`
- **When** se renderiza la rejilla
- **Then** la celda muestra el badge "Hecho" y no ofrece desprogramación

### Requirement: Un solo camino a plan_sessions

Las tarjetas de plantilla SHALL ofrecer el botón "Programar"; la rejilla es la
única superficie de programación.

#### Scenario: Tarjeta sin Programar

- **Given** la lista de plantillas bajo la rejilla
- **When** se renderiza una tarjeta de plantilla
- **Then** no aparece botón "Programar" ni estado asociado
  (`scheduling/date/scheduled/scheduleError` eliminados)
