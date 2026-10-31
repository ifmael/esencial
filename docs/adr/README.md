# ADR — Flujo agéntico

Decisiones de arquitectura del flujo que ejecuta tareas de Esencial. Una ADR
explica el contexto y las consecuencias de una decisión ya tomada; no sustituye
a `docs/flujo.md` (operación) ni a `TODO-flujo-agentes.md` (plan).

Formato: **Estado**, **Fecha**, **Contexto**, **Decisión**, **Alternativas** y
**Consecuencias**. Estados posibles: `Aceptada`, `Sustituida` y `Provisional`.

| ADR                                                | Decisión                                                          | Estado      | Fecha      |
| -------------------------------------------------- | ----------------------------------------------------------------- | ----------- | ---------- |
| [0001](0001-ejecucion-local-sin-coordinador.md)    | Ejecución local secuencial, sin coordinador de nivel 2            | Aceptada    | 2026-10-21 |
| [0002](0002-contenedor-por-fase-estado-en-host.md) | Contenedor efímero por fase y estado fuera del alcance del worker | Aceptada    | 2026-10-21 |
| [0003](0003-integridad-rutas-ci-revision.md)       | Rutas protegidas, CI y revisión como autoridades de integridad    | Aceptada    | 2026-10-21 |
| [0004](0004-migraciones-aditivas.md)               | Migraciones aditivas, inmutables y aprobadas antes de validar     | Aceptada    | 2026-10-21 |
| [0005](0005-previews-por-rama.md)                  | Previews por rama con D1/R2 compartidos y Access                  | Aceptada    | 2026-10-24 |
| [0006](0006-identidad-de-automatizacion.md)        | Identidad propia de GitHub y Linear para la automatización        | Aceptada    | 2026-10-29 |
| [0007](0007-hermes-como-runtime.md)                | Hermes como runtime de los agentes                                | Provisional | 2026-10-23 |
