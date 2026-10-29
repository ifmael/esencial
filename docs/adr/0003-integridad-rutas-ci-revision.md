# ADR-0003 — Rutas protegidas, CI y revisión como autoridades de integridad

- **Estado:** Aceptada
- **Fecha:** 2026-10-21

## Contexto

El agente implementa y también puede proponer cambios en tests, CI o rutas
sensibles. La confianza en el prompt no basta: la comprobación tiene que ser
externa y reproducible. El repositorio ya tiene `main` protegido y una CI que
decide; el flujo necesita que esa autoridad no quede dentro del contenedor.

## Decisión

La integridad se apoya en tres barreras:

1. **Rutas protegidas:** `orquestator-cli/protected-paths.txt` se lee de `main`.
   Si el diff las toca, hace falta `approve` por TTY con motivo; el hash aprobado
   caduca si el diff cambia y se publica el commit status `gh-guard`.
2. **Comprobaciones antes del review:** `lint`, tipos, tests con cobertura y e2e;
   los tests nuevos o modificados deben fallar contra `main` (RED). Un `.only`,
   un test borrado o un `expect` eliminado es un hallazgo.
3. **Revisión por otro agente y merge humano:** `review` y `pr-review` revisan el
   resultado; `In validation` exige la CI verde y la PR mergeable. El merge lo
   hace una persona.

El agente no puede modificar la CI que lo controla ni saltarse el estado
`gh-guard`. No hay bypass de administrador para el flujo.

## Alternativas

- **Confiar en el prompt del agente:** rápido, pero no demuestra que el test o la
  CI sigan siendo válidos.
- **Una etiqueta manual:** más simple que un hash, pero no ata la aprobación al
  contenido exacto del diff.
- **Permitir que el agente ajuste la CI:** reduce fricción, pero elimina la
  separación entre quien implementa y quien comprueba.

## Consecuencias

- Una tarea con rutas protegidas se detiene hasta que una persona aprueba; es
  fricción deliberada.
- El hash y el status `gh-guard` obligan a repetir la aprobación si el diff
  cambia después.
- La CI necesita secretos de solo lectura y un job específico para migraciones.
- La revisión por otro agente reduce el sesgo del implementer, pero no sustituye
  el criterio humano en el merge.

## Referencias

- `TODO-flujo-agentes.md`, C1-A, R4 y F4.
- `docs/flujo.md`, «Límites» y «Comprobaciones».
- `orquestator-cli/protected-paths.txt` y `orquestator-cli/lib/guard.mjs`.
