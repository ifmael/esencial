# ADR-0013 — Las dependencias entran por main, antes de la tarea

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

La imagen del worker hornea el store de pnpm con el lockfile del `main` del
espejo, y las fases instalan con `pnpm install --offline --frozen-lockfile`. Un
clon que pide una versión que no está en el store falla de forma opaca (la
instalación offline no puede resolverla). Hasta ahora nada lo detectaba antes de
lanzar la instalación, y una rama atrasada podía pasar horas sin darse cuenta.

Con la construcción automática (ADR 0012) esto se vuelve más visible: la receta
que etiqueta la imagen y el clon que la usa pueden discrepar.

## Decisión

- **Ninguna fase de agente instala dependencias.** Las dependencias entran por
  `main` antes de que exista la tarea. El implementador no añade paquetes: si los
  necesita, la tarea se para.
- **La puerta de lockfile compara conjuntos de paquete+versión.** Se leen las
  claves de `packages:` del lockfile del clon y del lockfile del `main` del
  espejo, sin Docker. Todo par del clon debe existir en la receta:
  - añadir algo en `main` es inocuo (el conjunto del clon sigue siendo
    subconjunto);
  - cambiar una versión en `main` o pedir en la rama algo ausente cierra la
    puerta;
  - una rama que toca el lockfile con aprobación también se bloquea,
    deliberadamente: la aprobación de rutas protegidas no cambia lo que hay
    horneado en la imagen.
- **La puerta vive en el preflight de la fase** (`runPhase`), así que cubre
  `check`, la sonda RED y `preview` de una vez. No corre en `spec-review`, que no
  instala desde el clon, ni con `ORQUESTATOR_IMAGE`: la puerta y la imagen forzada
  no se mezclan (nadie garantiza el store de esa imagen).
- **El aviso es uno solo**: parada con pista, como «faltan aprobaciones» en
  `check`. Ni estado `Blocked` ni comentario en Linear.
- **Alinear es un merge, no un rebase.** Una persona ejecuta el merge del `main`
  del espejo en la rama; el flujo no añade un comando de alineación. El rebase
  queda como opción posible porque los dos empujes fuerzan con `+` (ADR 0012).
- **Procedimiento si una tarea necesita una dependencia:**
  1. para la tarea;
  2. lleva la dependencia a `main` con su propio cambio (y su reconstrucción de la
     imagen, que sale sola);
  3. alinea la rama con un merge del main del espejo;
  4. reanuda la tarea.

## Alternativas

- **Permitir que la fase instale con red:** rompe el aislamiento de la fase y
  convierte el store horneado en decorativo.
- **Reconstruir la imagen con el lockfile de la rama:** multiplica imágenes por
  rama, deja de haber una receta única y la etiqueta pierde su significado.
- **Comparar hashes del lockfile entero:** cualquier adición en `main` bloquearía
  todas las ramas abiertas, incluso las que no piden nada nuevo.
- **Comando `orquestator align`:** automatiza un merge que conviene mirar; el
  remedio es una operación de git normal y documentada.

## Consecuencias

- Las ramas atrasadas se detectan antes de lanzar la instalación y el mensaje dice
  qué pares faltan y qué hacer.
- El coste es un merge humano cuando `main` cambia versiones; a cambio, la imagen
  y el clon no pueden discrepar en silencio.
- Una tarea que necesita una dependencia se para y se convierte en dos cambios
  (dependencia en `main` y tarea), no en uno.
- La puerta lee del espejo, así que comparte fuente con la etiqueta y la sonda
  RED: no hay una tercera verdad.
- Queda escrito como límite: los dos fetches del refresco no son atómicos y una
  referencia atrasada del checkout hace que `guard` bloquee de más.

## Referencias

- `orquestator-cli/lib/lockfile.mjs` y `orquestator-cli/lib/container.mjs`
  (`preparePhase`).
- `orquestator-cli/test/lockfile.test.mjs` y `test/container.test.mjs`.
- ADR 0012 (imagen del worker).
- `docs/construccion-imagen.md`, §10.
