# Spec — EP9 programar sesiones (schedule desde UI + día con ejercicios)

## ADDED Requirements

### Requirement: Day endpoint incluye ejercicios de la sesión

`GET /api/day/:date` MUST incluir, dentro de `session` (cuando no es `null`), el campo
`exercises`: array de `{ exerciseId, exerciseName, position }` con los ejercicios de la
plantilla programada, ordenados ascendente por `position`. Debe ser `[]` cuando la
plantilla no tiene ejercicios. El resto del envelope (`date`, `isoWeek`, `dayIndex`,
`meals`, `note`) y los códigos de error (400 con `{ error, field: "date" }`) no cambian.

#### Scenarios

- Given se programó `POST /api/plan-sessions { date: "2026-09-02", templateId: T }` y la plantilla T tiene ejercicios en posiciones 2 y 1, When `GET /api/day/2026-09-02`, Then `session.exercises` es exactamente `[{exerciseId, exerciseName, position: 1}, {…, position: 2}]` (orden por position, no por inserción).
- Given una plantilla sin ejercicios, When el día se consulta, Then `session.exercises` es `[]` y el resto del envelope no cambia.
- Given no hay sesión para la fecha, Then `session` sigue siendo `null` (sin campo exercises).

### Requirement: Tarjeta FUERZA lista los ejercicios programados

La sección FUERZA de `/` en estado `planned` MUST renderizar los ejercicios de
`session.exercises` como lista numerada (número + nombre, en español), según el wireframe
`esencial_hoy_desktop_v2`. Con `exercises` ausente o vacío la tarjeta debe seguir siendo
válida (sin lista). Los estados sin sesión y `logged` no cambian.

#### Scenarios

- Given un mock de `/api/day` con `session.exercises` de 4 items y status planned, When la home renderiza, Then la sección FUERZA muestra 4 elementos de lista con número creciente y el nombre de cada ejercicio.
- Given `session.exercises` ausente o `[]`, When la home renderiza, Then la tarjeta muestra plantilla + badge Pendiente + botón "Registrar sesión" sin lista y sin error.
- Given status `logged`, When la home renderiza, Then la tarjeta muestra el summary verde como antes (sin lista numerada nueva).

### Requirement: Programar sesión desde Plan fuerza

Cada tarjeta de plantilla en `/plan-fuerza` MUST ofrecer la acción "Programar" que abre
un bloque inline con un `<input type="date">` nativo y confirmación. Al confirmar DEBE
emitir `POST /api/plan-sessions { date, templateId }`. Ante 201 debe mostrar
confirmación "Programada para <fecha>"; ante 409 debe mostrar "Ya hay una sesión ese
día"; ante 400 debe mostrar el `error` del envelope `{ error, field }`. Sin librerías
nuevas (sin date-picker externo).

#### Scenarios

- Given el usuario abre el bloque Programar de una plantilla, When confirma con una fecha válida sin sesión, Then el SPA hace POST a `/api/plan-sessions` con `{date, templateId}` de esa plantilla y muestra "Programada para <fecha>".
- Given ya existe una sesión para la fecha elegida, When el POST responde 409, Then la UI muestra "Ya hay una sesión ese día" y no navega.
- Given la fecha está vacía o mal formada, When el POST responde 400 con `{error, field:"date"}`, Then la UI muestra el mensaje de error del envelope.
- Given el usuario cancela, When el bloque está abierto, Then se cierra sin emitir ninguna petición.
