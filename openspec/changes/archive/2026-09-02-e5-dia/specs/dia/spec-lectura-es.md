# Spec — E5 día (traducción de lectura)

> Versión legible del spec oficial (spec.md, en inglés, es el documento válido).

## 1. Endpoint del día (`GET /api/day/:date`)

Una sola llamada devuelve TODO el día: comidas planificadas (desayuno/almuerzo/cena con
recipeId y nombre), sesión de fuerza programada (nombre de plantilla, estado
`planned`/`logged`, y resumen — ejercicios, series, esfuerzo — si está registrada) y la
nota del día. Si no hay nada planificado no es un error: responde 200 con datos vacíos
(`meals: []`, `session: null`, `note.text: ""`). La fecha inválida (p. ej. `2026-9-2`)
responde 400 con `{ error, field: "date" }`, igual que las notas. Si la base de datos
falla, error genérico 500 sin filtrar SQL.

- Martes con desayuno y cena planificados → solo esas dos comidas, en orden.
- Receta borrada de un slot → el slot sale con `recipeId: null` (se pinta como vacío).
- Día con sesión cerrada (esfuerzo 3, 20 series, 5 ejercicios) → `status: "logged"` con ese resumen.

## 2. Fechas: semana ISO, lunes = 0

La conversión fecha → (`isoWeek`, `dayIndex`) sigue ISO-8601: la semana empieza en lunes
(lunes = 0 … domingo = 6) y el número de semana usa la regla del jueves — el 1 de enero de
2027 todavía pertenece a la semana 53 de 2026. Es una función pura sobre el texto
`YYYY-MM-DD`: el servidor nunca mira el reloj; "hoy" lo decide el navegador.

- 2026-09-01 → `2026-W36`, índice 1. 2027-01-01 → `2026-W53`, índice 4. 2026-09-06 (domingo) → índice 6, misma semana W36.

## 3. Cabecera y navegación de fechas (`/`)

Portada real (sustituye al placeholder E0): título con la fecha en español, "Hoy — martes 2
de septiembre" cuando la fecha elegida es hoy; flechas ← → que ya existen; botón "Hoy" que
salta a hoy; y un selector nativo de fecha para saltar a cualquier día (sin librería de
calendario). Debajo, accesos "Plan recetas" y "Plan fuerza". Cada fecha elegida se carga con
UNA sola petición a `/api/day/<fecha>`.

- Pulsar → dos veces → pide 2026-09-04 exactamente una vez y el título pierde el prefijo "Hoy".

## 4. Sección RECETA

Una tarjeta compacta por comida con receta: etiqueta de comida + nombre, en orden
desayuno→almuerzo→cena. Tocar la tarjeta abre el detalle de la receta (`/plan-recetas/<id>`).
Sin foto por ahora (el esquema aún no tiene columna de foto). Si ese día no hay ninguna
comida con receta → estado vacío: "Aún no has planificado comidas para este día" con enlace
al plan semanal. El vacío NUNCA se pinta como error.

## 5. Sección FUERZA

Tres y solo tres estados:
1. Sin sesión (`session: null`) → "Sin sesión asignada" + CTA a `/plan-fuerza`.
2. Programada (`planned`) → nombre de la plantilla, badge ámbar "Pendiente" y botón
   primario "Registrar sesión" que navega a `/sesion/<fecha>` (la pantalla real llega con
   E6; E5 deja un placeholder para que el botón nunca sea un enlace muerto).
3. Registrada (`logged`) → tarjeta verde de resumen: "5 ejercicios · 20 series ·
   esfuerzo 3/5"; tocarla va a la misma ruta (allí se verá solo-lectura).

## 6. Sección NOTAS DEL DÍA (autoguardado)

Área de texto con la nota del día (placeholder "Escribe algo sobre hoy"). Al dejar de
escribir ~0,8 s se guarda sola con `PUT /api/notes/<fecha>` e indicador visible
("Guardando…" → "Guardado"). Cambiar de fecha VOLCANDO el pendiente: lo escrito se guarda
en la fecha anterior, jamás en la nueva. Borrar todo y cambiar de fecha guarda texto vacío.
Si el guardado falla → indicador rojo "No guardado — reintentar" conservando lo escrito.

## 7. Estados de carga y error

Mientras carga: skeletons (bloques de superficie), nunca secciones en blanco. Si la petición
falla: una sola tarjeta de error con "Reintentar"; las flechas de fecha siguen funcionando.
Navegar rápido (→ → ←) no puede dejar datos de otra fecha en pantalla: las respuestas de
fechas ya descartadas se ignoran.

## 8. Estética

Tokens de DESIGN.md: tarjetas blancas radio 12px borde #E7E5E4, verde #15803D en acciones
primarias y completadas, ámbar para pendiente, rojo solo para error; móvil en una columna
(RECETA → FUERZA → NOTAS) con tabs inferiores del Shell visibles; escritorio multi-columna
según la variante desktop del wireframe; objetivos táctiles ≥ 44px; etiquetas en español.
