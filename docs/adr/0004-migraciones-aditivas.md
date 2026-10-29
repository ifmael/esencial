# ADR-0004 — Migraciones aditivas, inmutables y aprobadas antes de validar

- **Estado:** Aceptada
- **Fecha:** 2026-10-21

## Contexto

La D1 de producción no tiene `down`: una migración aplicada no se deshace con un
rollback. El flujo necesita desplegar código y esquema sin romper la versión que
sigue en producción mientras la PR está abierta. El agente puede escribir SQL,
pero no debe decidir por su cuenta cuándo se aplica.

## Decisión

Las migraciones son aditivas y compatibles hacia atrás: columnas nuevas que
admiten vacíos o tienen defecto, tablas nuevas y datos nuevos; por defecto no se
acepta un `DROP`, un `ALTER … DROP` ni un `ADD … NOT NULL` sin defecto. La
excepción exige revisión y `--force` explícito. Una migración aplicada es
inmutable; cualquier corrección va en un número nuevo.

El CLI detecta `api/migrations/**` en el diff. `approve --migracion` es TTY y
guarda el hash de nombres y contenido; `migrate` aplica solo los ficheros
aprobados y se para si hay una migración pendiente ajena o si un contenido ya
aplicado cambió. La aplicación ocurre antes de `In validation`; el job `migracion`
de la CI solo lee `d1_migrations` con un token de solo lectura y exige que estén
aplicadas.

## Alternativas

- **Migraciones automáticas al arrancar:** menos pasos, pero mezcla esquema y
  despliegue y puede romper la versión anterior antes del merge.
- **Rollback con otra herramienta:** exigiría un `down` que D1 no ofrece y
  duplicaría el estado real.
- **Aplicación manual sin CLI:** deja el orden y la aprobación fuera del flujo y
  hace fácil aplicar una migración no revisada.

## Consecuencias

- El esquema puede desplegarse antes que el código; la PR vieja debe seguir
  funcionando con las columnas nuevas.
- No hay vuelta atrás: un error se corrige con otra migración, no restaurando la
  anterior.
- Hacen falta el token de edición de D1 en el host y el de solo lectura en la CI.
- Una migración que nace obligatoria sobre filas existentes requiere el patrón de
  tres pasos: columna nulable, código que la rellena y después la restricción.

## Referencias

- `TODO-flujo-agentes.md`, sección de migraciones y M5b.
- `DEPLOY.md`, orden de despliegue.
- `docs/flujo.md`, «Migraciones (M5b)».
- `orquestator-cli/lib/migrate.mjs` y `.github/workflows/ci.yml` (job `migracion`).
