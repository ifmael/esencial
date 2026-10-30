# Comportamiento de la aplicación

Spec de comportamiento observable de Esencial. Una regla por línea, con su
condición y su resultado. No incluye recuentos de semilla, migraciones, píxeles,
nombres de tests ni detalles de implementación.

Criterio: entra lo que el usuario o el servicio pueden observar; no entra lo que solo
describe una tabla, un archivo o una decisión interna.

Estado: primera entrega de 20 reglas. Faltan descansos detallados, vueltas de
bloques, historial, catálogo, recetas, plantillas, autenticación y navegación.

## Identificadores

`regla-<área>-<número>`, con el área escrita completa y sin tildes:
`regla-sesion-03`. El número empieza en 01. Un identificador no se renumera ni se
reutiliza.

## Planificación

- **regla-planificacion-01** Un día planificado no puede quedarse sin ejercicios: quitar el
  último ejercicio elimina la sesión y el día vuelve a «+ añadir».
- **regla-planificacion-02** Un ejercicio de fuerza añadido a un día o a una plantilla nace con
  3 series; el cardio entra sin series.
- **regla-planificacion-03** Al planificar desde una plantilla, el día copia los descansos
  vigentes de la plantilla; editar la plantilla después no altera días ya
  planificados.
- **regla-planificacion-04** Los descansos se guardan en segundos, con 120 s por defecto y rango
  1–3600; vaciar el campo deja el ejercicio sin descanso.
- **regla-planificacion-05** El cardio solo admite descanso «al terminar»; no tiene descanso
  entre series.
- **regla-planificacion-06** Un bloque encadenado solo admite fuerza y termina en su último
  miembro: el último no se encadena con el siguiente y los descansos viven solo
  en él.

## Registro y sesión

- **regla-sesion-01** La página `/sesion/:date` solo resume; registrar ocurre únicamente
  en el modo sesión.
- **regla-sesion-02** Un día planificado ofrece «Empezar»; un día registrado muestra su
  resumen y «Editar».
- **regla-sesion-03** Una serie solo se marca como hecha si tiene las marcas que pide su
  métrica; en `weight_reps`, los kilos se omiten con «Sin peso».
- **regla-sesion-04** Editar las marcas de una serie la marca sola cuando queda completa
  y la desmarca al vaciar un campo; los valores precargados de la sesión anterior
  no marcan nada.
- **regla-sesion-05** «Sin peso» es una decisión de la sesión por ejercicio: oculta los
  kilos, exige repeticiones y no envía kilos.
- **regla-sesion-06** Añadir una serie copia las marcas de la última y la crea sin
  marcar; el ejercicio admite entre 1 y 20 series.
- **regla-sesion-07** Copiar la serie homóloga solo se ofrece si la sesión anterior tiene
  ese índice; nunca marca la serie ni cambia «Sin peso».
- **regla-sesion-08** La sesión anterior se empareja por nombre no nulo y fecha anterior;
  una sesión sin nombre nunca empareja.
- **regla-sesion-09** Corregir un registro reemplaza series, cardio, esfuerzo y nota; no
  permite cambiar los ejercicios de la sesión.
- **regla-sesion-10** El borrador se guarda solo en sesiones planificadas, uno por fecha;
  se limpia al cerrar o al abrir un día sin sesión o ya registrado, y solo se
  restaura si el ejercicio y el número de series siguen encajando con el plan.
- **regla-sesion-11** Marcar una serie arranca el descanso programado; la última serie
  del último ejercicio no arranca nada y corta la pausa en curso.

## Experiencia observable

- **regla-experiencia-01** En modo sesión no hay desplazamiento vertical y se ve una sola serie a la
  vez.
- **regla-experiencia-02** El aspa y Escape piden confirmación antes de salir del modo sesión.
- **regla-experiencia-03** «Terminar» exige elegir esfuerzo; con series pendientes muestra un
  aviso con lo que queda y permite seguir o cerrar igual.
