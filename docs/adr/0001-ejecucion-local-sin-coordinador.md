# ADR-0001 — Ejecución local con fases secuenciales, sin coordinador de nivel 2

- **Estado:** Aceptada
- **Fecha:** 2026-10-21

## Contexto

El flujo debía convertir una issue de Linear en una PR revisada sin convertir la
infraestructura en un segundo producto. Las alternativas eran ejecutar agentes en
GitHub Actions o un VPS, añadir un coordinador que repartiera tareas, o dejar que
un CLI local encadenara las fases. En el piloto hay un solo operador y un solo
equipo; la prioridad es validar el bucle completo y poder depurarlo.

## Decisión

`orquestator-cli` corre en el host y `run` es el camino por defecto. Encadena las
fases en orden (`start → implement → check → review → pr → preview → ship →
pr-review`) y cada fase termina antes de empezar la siguiente. `watch` es un
servicio local que sondea Linear para lanzar `spec-review`, despachar tareas
`Ready` y detectar PRs mergeadas; puede llevar hasta `--max-parallel` tareas a la
vez (la unidad instalada usa 4), pero cada tarea mantiene sus fases en secuencia.
No hay webhook ni servicio 24/7. No se añade un coordinador de nivel 2 mientras
`run` cubra el flujo.

GitHub Actions sigue siendo la CI, pero no ejecuta agentes ni workers del flujo.
El estado de la tarea vive en el host, no en un servicio remoto.

## Alternativas

- **GitHub Actions o VPS:** da paralelismo y disponibilidad, pero añade secretos,
  entornos y depuración remota antes de validar el bucle.
- **Coordinador de nivel 2:** reparte tareas y eventos, pero duplica la máquina de
  estados y hace más difícil atribuir un fallo durante el piloto.
- **Webhook público:** evita el sondeo, pero exige endpoint, firma y exposición;
  se descartó como camino principal.

## Consecuencias

- El flujo es fácil de inspeccionar y de parar; no hay una capa remota que oculte
  el estado.
- Si el equipo se apaga, el flujo se pausa; al volver se reanuda con `run` o
  `watch`.
- El estado no se comparte entre máquinas y la concurrencia queda limitada por el
  host; las tareas en paralelo comparten la memoria y el swap del equipo. Es
  aceptable para un piloto de un operador, pero hay que vigilar el pico.
- La latencia de `watch` depende del intervalo de sondeo; no es un sistema de
  eventos en tiempo real.

## Referencias

- `TODO-flujo-agentes.md`, decisión D1-A y sección M5b.
- `docs/flujo.md`, «Ramas y PR» y «Estados».
- `orquestator-cli/lib/cli.mjs` (`run`, `watch`) y
  `orquestator-cli/systemd/orquestator-watch.service` (`--max-parallel 4`).
