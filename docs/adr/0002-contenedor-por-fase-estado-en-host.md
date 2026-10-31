# ADR-0002 — Contenedor efímero por fase y estado fuera del alcance del worker

- **Estado:** Aceptada
- **Fecha:** 2026-10-21

## Contexto

Una tarea dura horas o días y pasa por implementación, comprobaciones, review y
pr-review. El agente necesita el mismo clon entre fases, pero no debe poder
cambiar el estado de la tarea, las aprobaciones ni la CI que lo controla. Un
contenedor único durante toda la tarea acumula permisos y deriva; un contenedor
nuevo por fase con un clon compartido separa el aislamiento del estado.

## Decisión

Cada fase ejecuta un `docker run --rm` nuevo con el mismo clon montado. Los
revisores montan el código en solo lectura; el implementer y `check` escriben sus
artefactos. El estado (`state.json`), el hash de `approve` y los informes viven en
`~/.orquestator/ESN-123/` en el host y no se montan en el contenedor. `main` se
publica en un espejo bare de solo lectura (`/upstream`); el worker hace
`git fetch /upstream main` y el host hace push y PR. Dentro del contenedor no hay
credenciales de git.

## Alternativas

- **Un contenedor por tarea:** conserva el entorno, pero el agente podría tocar
  más estado y las fases comparten permisos y procesos residuales.
- **Estado y aprobaciones dentro del clon:** simplifica el montaje, pero deja el
  estado al alcance del agente y rompe la separación entre worker y orquestador.
- **Fetch directo del remoto desde el worker:** evita el espejo, pero amplía la
  superficie de red y las credenciales dentro del contenedor.

## Consecuencias

- El agente no puede reescribir su propio estado ni saltarse una aprobación.
- Cada fase arranca desde una base reproducible; el clon conserva el trabajo entre
  fases.
- Hay coste de arranque por fase y más montajes que mantener.
- El estado del host necesita copia o recuperación; un borrado accidental no se
  reconstruye desde el contenedor.

## Referencias

- `TODO-flujo-agentes.md`, R1, R2 e I2.
- `docs/flujo.md`, «Artefactos» y «Fases de agente».
- `orquestator-cli/lib/container.mjs`, `state.mjs` y `upstream.mjs`.
