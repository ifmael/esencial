# ADR-0006 — Identidad propia de GitHub y Linear para la automatización

- **Estado:** Aceptada
- **Fecha:** 2026-10-29

## Contexto

Los comentarios y cambios de estado salían con la cuenta personal del operador.
Eso mezcla la actividad humana con la del agente, dificulta filtrar el ruido y
obliga a compartir credenciales personales. GitHub y Linear ofrecen identidades
de aplicación; el flujo necesita que la autoría sea reconocible sin crear una
cuenta de usuario máquina.

## Decisión

El CLI usa una **GitHub App** (`esencial-orquestator`) con JWT RS256 y token de
instalación cacheado para comentarios, estados, clon y push. Los permisos son
Contents RW, Pull requests RW, Commit statuses RW, Checks R y Metadata R; no
incluye Actions/Workflows. `GH_TOKEN` queda como fallback.

Para **Linear** usa una OAuth app (`esencial-orquestator`) con
`client_credentials`: pide un token de app de 30 días, lo cachea y lo usa para
leer, comentar y mover estados. Los comentarios se crean con
`createAsUser: Orquestator` y salen con el actor de la app. `LINEAR_API_KEY` queda
como fallback y `LINEAR_USER_ID` conserva la asignación y la mención al humano en
los avisos de bloqueo.

## Alternativas

- **Usuario máquina:** da una identidad visible, pero exige otra cuenta, otro
  email y otra sesión que mantener.
- **PAT o API key personal:** es lo más rápido, pero atribuye la actividad al
  humano y concentra permisos en una credencial de larga duración.
- **Token de GitHub App para todo, incluida CI:** la App no necesita Actions y
  añadir ese permiso amplía la superficie sin resolver nada del flujo.

## Consecuencias

- La autoría del agente es distinguible y se puede filtrar por actor.
- No se comparte la contraseña ni la sesión del operador.
- Hay que mantener la private key de GitHub, los secretos de Linear y la
  instalación de la App; si caduca el token de Linear, se pide otro.
- La App de Linear usa un token de 30 días sin refresh; el CLI lo cachea hasta
  caducar.
- `LINEAR_API_KEY` y `GH_TOKEN` siguen existiendo como respaldo, así que una
  configuración incompleta puede volver silenciosamente a la identidad personal.

## Referencias

- `TODO-flujo-agentes.md`, M6 (identidad GitHub y Linear).
- `docs/flujo.md`, «Identidad GitHub» e «Identidad Linear».
- `orquestator-cli/lib/github.mjs`, `linear.mjs` y `config.mjs`.
