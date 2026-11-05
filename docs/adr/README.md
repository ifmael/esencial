# ADR — Esencial

Decisiones de arquitectura del proyecto y de su flujo agéntico. Una ADR explica
el contexto y las consecuencias de una decisión ya tomada; no sustituye a
`docs/flujo.md` (operación), `AGENTS.md` (contrato operativo) ni a
`TODO-flujo-agentes.md` (plan).

Formato: **Estado**, **Fecha**, **Contexto**, **Decisión**, **Alternativas** y
**Consecuencias**. Estados posibles: `Aceptada`, `Sustituida` y `Provisional`.
Última revisión: 2026-10-31.

| ADR                                                  | Decisión                                                           | Estado      | Fecha      |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ----------- | ---------- |
| [0001](0001-ejecucion-local-sin-coordinador.md)      | Ejecución local con fases secuenciales, sin coordinador de nivel 2 | Aceptada    | 2026-10-21 |
| [0002](0002-contenedor-por-fase-estado-en-host.md)   | Contenedor efímero por fase y estado fuera del alcance del worker  | Aceptada    | 2026-10-21 |
| [0003](0003-integridad-rutas-ci-revision.md)         | Rutas protegidas, CI y revisión como autoridades de integridad     | Aceptada    | 2026-10-21 |
| [0004](0004-migraciones-aditivas.md)                 | Migraciones aditivas, inmutables y aprobadas antes de validar      | Aceptada    | 2026-10-21 |
| [0005](0005-previews-por-rama.md)                    | Previews por rama con D1/R2 compartidos y Access                   | Aceptada    | 2026-10-24 |
| [0006](0006-identidad-de-automatizacion.md)          | Identidad propia de GitHub y Linear para la automatización         | Aceptada    | 2026-10-29 |
| [0007](0007-hermes-como-runtime.md)                  | Hermes como runtime de los agentes                                 | Provisional | 2026-10-23 |
| [0008](0008-dos-workers-spa-api.md)                  | Dos Workers B' para el SPA y la API                                | Aceptada    | 2026-09-19 |
| [0009](0009-d1-r2-estado-gestionado.md)              | D1 y R2 como estado gestionado de la app                           | Aceptada    | 2026-09-06 |
| [0010](0010-access-identidad-borde.md)               | Cloudflare Access como identidad de borde                          | Aceptada    | 2026-10-04 |
| [0011](0011-sistema-diseno-material-3-expressive.md) | Sistema de diseño Material 3 Expressive propio                     | Aceptada    | 2026-09-28 |
