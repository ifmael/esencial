# Comportamiento de la aplicación

Especificación de comportamiento observable de Esencial. Una regla por viñeta,
con su condición y su resultado. No incluye recuentos de semilla, migraciones,
píxeles, nombres de pruebas ni detalles de implementación.

Criterio: entra lo que el usuario o el servicio pueden observar; no entra lo que solo
describe una tabla, un archivo o una decisión interna.

Estado: 71 reglas; revisión pendiente.

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
  miembro: el último no se encadena con el siguiente.

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
- **regla-sesion-11** La última serie del último ejercicio no arranca descanso y
  corta la pausa en curso.

## Descansos

- **regla-descansos-01** Marcar una serie arranca el descanso que toca: entre
  series o fin de ejercicio. Si el ejercicio no tiene descanso programado, no
  aparece barra ni suena nada.
- **regla-descansos-02** El descanso de entre series deja el cursor en la serie
  siguiente; en un bloque, en la vuelta siguiente del primer miembro. El de fin lo
  deja en la primera serie del ejercicio que entra, y el lanzado a mano donde
  estaba.
- **regla-descansos-03** «Saltar» corta el descanso sin pitido y avanza como si
  hubiera terminado; el play/pausa lo congela y lo reanuda desde lo que quedaba.
- **regla-descansos-04** La cuenta se basa en la hora de fin, no en tics: al volver
  a la pestaña se resincroniza y no se descuadra.
- **regla-descansos-05** El descanso avisa a 3 s y 2 s y suena tres tonos al
  terminar; cada aviso suena una vez y no suena tras «Saltar» ni al cortarlo la
  última serie de la sesión.

## Bloques

- **regla-bloques-01** Un bloque son dos o más ejercicios consecutivos
  encadenados; una fila suelta no forma bloque.
- **regla-bloques-02** El bloque avanza por vueltas: una serie de cada miembro,
  saltando al que agotó las suyas; la vuelta la define la serie que se marca.
- **regla-bloques-03** A mitad de vuelta, marcar una serie pasa al siguiente
  miembro sin descanso; al cerrar la vuelta arranca el descanso del bloque.
- **regla-bloques-04** Los descansos del bloque se programan solo en el último
  miembro: entre vueltas y al terminar; los intermedios no admiten descanso.
- **regla-bloques-05** Al terminar el bloque, el descanso de fin avanza al
  ejercicio siguiente; el título muestra el tipo de bloque y el miembro encadenado
  indica con quién va.

## Historial

- **regla-historial-01** El historial lista los días registrados del más reciente
  al más antiguo, agrupados por mes; cada fila abre la sesión registrada de ese día.
- **regla-historial-02** Solo cuentan las series y el cardio marcados como hechos;
  un día sin ninguna marca dice «Sin marcas».
- **regla-historial-03** El rango de fechas es inclusivo; si la fecha inicial es
  posterior a la final, la pantalla no consulta y el servicio responde 400.
- **regla-historial-04** La lista pagina de 20 en 20, con techo de 60; «Cargar
  más» solo aparece si queda otra página y cambiar el rango vuelve a la primera.
- **regla-historial-05** La ficha del ejercicio muestra la progresión de lo
  cargado, las series o el cardio de cada día y el mejor histórico, que puede ser
  de un día fuera de la página.
- **regla-historial-06** La progresión usa kilos si hay, si no segundos, si no
  repeticiones, y en cardio kilómetros.

## Catálogo y taxonomía

- **regla-catalogo-01** La búsqueda de ejercicios casa nombre, alias y grupos, sin
  distinguir mayúsculas ni tildes.
- **regla-catalogo-02** Un ejercicio debe tener al menos un grupo muscular; una
  sub-región solo puede pertenecer a un grupo que el ejercicio ya tenga, o el
  servicio responde 400.
- **regla-catalogo-03** Una sub-región repetida o sin grado es 400; los grados son
  principal, secundario y estabilizador.
- **regla-catalogo-04** Elegir un músculo añade su grupo si falta; quitar un grupo
  elimina sus músculos. Cada músculo elegido nace principal y su grado se cambia
  aparte.
- **regla-catalogo-05** Filtrar por un grupo devuelve los ejercicios de ese grupo;
  filtrar por un músculo no mira su grado.
- **regla-catalogo-06** Un alias vacío o repetido es 400; el nombre del ejercicio es
  único.

## Recetas y nutrición

- **regla-recetas-01** Crear y editar receta son páginas propias; cancelar, Escape
  o atrás no llaman al servicio, y guardar hace una sola petición de creación o de
  edición.
- **regla-recetas-02** Descripción y comensales solo aparecen al editar; al crear
  quedan vacíos.
- **regla-recetas-03** Los macros se calculan por ración; los opcionales y lo que
  va sin cantidad no cuentan, y un ingrediente sin enlace o con una unidad no
  convertible deja el cálculo como aproximado.
- **regla-recetas-04** Los totales del día usan una ración por comida; sin recetas
  no hay total y los valores aproximados se marcan con «≈».
- **regla-recetas-05** La unidad del ingrediente es texto libre; el desplegable
  conserva una unidad existente que no sea gramos, mililitros o unidad.
- **regla-recetas-06** Una foto nueva se sube antes de guardar; si la subida falló
  y quedó pendiente, el guardado la reintenta.
- **regla-recetas-07** El nombre exacto de un alimento lo enlaza; cualquier otro
  texto suelta el enlace. Un alimento enlazado que no exista es 400.

## Plantillas

- **regla-plantillas-01** Crear y editar plantilla son páginas propias; cancelar,
  Escape o atrás vuelven a la lista sin llamar al servicio.
- **regla-plantillas-02** Guardar una plantilla envía una sola petición con las
  posiciones en orden y vuelve a la lista con la tarjeta guardada desplegada.
- **regla-plantillas-03** El editor permite ordenar ejercicios con ratón, tacto y
  teclado; Escape cancela un arrastre de teclado sin abandonar la página.
- **regla-plantillas-04** Cuando la métrica de un ejercicio es de tiempo, el editor
  oculta las repeticiones mínimas y máximas.

## Autenticación y navegación

- **regla-autenticacion-01** La identidad la prueba Cloudflare Access en el borde;
  la aplicación no tiene inicio de sesión propio ni gestiona la credencial de
  sesión.
- **regla-autenticacion-02** Si el servicio no responde al arrancar, la aplicación
  pasa por el retorno de sesión y vuelve; así no confunde la falta de credencial
  con un fallo de datos.
- **regla-autenticacion-03** Un fallo de sesión en la aplicación se resuelve
  recargando una vez por pestaña y sesión.
- **regla-autenticacion-04** Salir del editor de recetas usa reemplazo, así atrás no
  reabre el borrador; el de plantillas sí apila.
- **regla-autenticacion-05** Crear receta, plantilla o ejercicio anima el control
  pulsado hasta el destino; editar y la carga directa no animan.

## Experiencia observable

- **regla-experiencia-01** En modo sesión no hay desplazamiento vertical y se ve una sola serie a la
  vez.
- **regla-experiencia-02** El aspa y Escape piden confirmación antes de salir del modo sesión.
- **regla-experiencia-03** «Terminar» exige elegir esfuerzo; con series pendientes
  muestra un aviso con lo que queda y permite seguir o cerrar igual.
- **regla-experiencia-04** El tema, sistema, claro u oscuro, se elige solo en
  Ajustes o con «Cambiar tema» de la paleta de comandos; el marco de la aplicación
  no lleva conmutador.
- **regla-experiencia-05** El menú lateral solo se pliega cuando la persona lo pide
  y recuerda esa preferencia; navegar entre secciones no lo cambia.
- **regla-experiencia-06** Las pantallas de calendario no llevan cabecera y ocupan
  la altura de la ventana; el menú lateral sigue midiendo la ventana y no la
  página.
- **regla-experiencia-07** Mover la semana anima la rejilla; abrir el editor de un
  día no deja la rejilla por encima del diálogo.
- **regla-experiencia-08** En pantallas estrechas, la cabecera del día es una sola
  fila de controles; el título sigue disponible para lectores de pantalla y no se
  muestran progreso ni enlaces a los planes.
- **regla-experiencia-09** La cabecera del detalle de ejercicio es una fila en
  todos los anchos; un nombre largo hace crecer la cabecera en altura, no se
  recorta.
- **regla-experiencia-10** Hay un solo anillo de foco; el campo con error se marca
  como inválido para el lector de pantalla y para el estilo, sin una clase
  duplicada.
- **regla-experiencia-11** Con reducción de movimiento activada, las transiciones
  duran un milisegundo, la animación de creación salta directa, lo que entra usa
  un fundido de 150 milisegundos y se apagan giros, onda y animación de cambio de
  semana.
- **regla-experiencia-12** Toda foto de receta se pide con credenciales entre
  orígenes para que el color dinámico pueda leerla.
- **regla-experiencia-13** Si no hay aceleración gráfica o el modelo tridimensional
  no carga, se pinta el mapa vectorial de siempre.
- **regla-experiencia-14** El visor tridimensional es una imagen sin foco; de solo
  lectura se nombra con cada músculo y su grado, y en el selector los músculos se
  ofrecen además como fichas para el teclado.
- **regla-experiencia-15** En el visor, la rueda o el pellizco acercan hacia el
  cursor y «Restablecer vista» aparece tras mover la cámara.
- **regla-experiencia-16** El globo de una comida aparece tras 500 milisegundos
  con el cursor encima o al enfocarla, y se cierra al salir, perder el foco, pulsar
  Escape o desplazar.
