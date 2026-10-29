# ADR-0007 — Hermes como runtime de los agentes

- **Estado:** Provisional
- **Fecha:** 2026-10-23

## Contexto

El flujo necesita un agente que pueda ejecutar herramientas dentro del contenedor,
leer un brief y escribir artefactos, con perfiles distintos para implementar,
revisar y revisar la PR. También necesita funcionar sin depender de una sesión
interactiva y con un modelo configurable por fase.

## Decisión

La imagen usa **Hermes v0.22.4** y cada fase lo ejecuta como
`hermes chat --oneshot -Q --safe-mode`, con un `HERMES_HOME` por fase que aporta
`config.yaml`, `SOUL.md` y `skills/`. Los perfiles son `spec-reviewer`,
`implementer`, `reviewer` y `pr-reviewer`; el modelo y el esfuerzo se cambian con
`ORQUESTATOR_MODEL_<FASE>` y `ORQUESTATOR_EFFORT_<FASE>`. El prompt va por stdin y
la salida final se escribe en el artefacto de la fase.

`omp` no se usa como worker mientras Hermes cumpla la adherencia y las
comprobaciones. La evaluación de `omp` queda abierta en M6 y solo sustituye a
Hermes si este falla de forma demostrable.

## Alternativas

- **`omp` como worker:** ya se usa como asistente interactivo, pero cambiar el
  runtime añade una integración nueva antes de tener una falla concreta.
- **Agente propio:** da control total, pero habría que reconstruir herramientas,
  sesiones, skills y manejo de contexto.
- **Servicio alojado:** reduce mantenimiento, pero añade red, secretos y latencia
  al contenedor que ya está aislado.

## Consecuencias

- La versión de Hermes está fijada en la imagen; actualizarla es un cambio
  explícito con smoke.
- Los perfiles y skills viven en el repositorio y se montan por fase; no se usan
  skills de proyecto que exijan confianza adicional.
- La salida es un artefacto, no un evento en vivo; el dashboard de Hermes sigue
  siendo una mejora opcional, no la señal de fin.
- Si Hermes no cumple la adherencia, la alternativa `omp` se evalúa sin cambiar
  el contrato de artefactos ni el estado del host.

## Referencias

- `TODO-flujo-agentes.md`, M1, M3 y M6.
- `docs/flujo.md`, «Fases de agente (M3)».
- `orquestator-cli/perfiles/` y `orquestator-cli/lib/hermes.mjs`.
