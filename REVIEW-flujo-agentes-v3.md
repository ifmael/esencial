# Revisión v3 del plan `TODO-flujo-agentes.md`

Fecha: 2026-10-21. Revisa la versión del plan con la revisión v2 adoptada (Bitácora
hasta «D1»). Las revisiones anteriores están en `REVIEW-flujo-agentes.md` y
`REVIEW-flujo-agentes-v2.md`. ★ = alternativa recomendada. Los números de línea son
los del plan actual.

## Estado de la revisión v2

Los 16 hallazgos de la v2 están adoptados, incluido D1-A (`run` sin coordinador).
El texto quedó coherente: I1 resuelto (el brief es copia de la issue, l.229),
orden `check → review` corregido, fecha al día, M4 sin `Spec review`, y las tres
preguntas cerradas (dónde corre `pr-review`, qué `wrangler`, heurística SQL).
El nombre `orquestator-cli` se mantuvo por decisión (l.171, l.806). Esta pasada
encuentra 4 gaps de seguridad, 4 de diseño y 5 restos de texto.

| Hallazgo v2 | Estado | Resto |
|---|---|---|
| N1-A host sin git en el clon | Adoptado | — |
| N2 `--no-hardlinks` | Adoptado | — |
| N3 comentarios filtrados | Adoptado | — |
| N4 commit status `migracion` | Adoptado | Bloquea PRs ajenas al flujo; sin repost por push (R3) |
| N5 rutas de test protegidas | Adoptado | — |
| D1-A `run` determinista | Adoptado | — |
| D2 sin MCP de Linear | Adoptado | — |
| D3 tag + smoke sin red | Adoptado | — |
| D4 rondas humanas | Adoptado | Contradicción menor en l.476 |
| D5 M5a/M5b | Adoptado | — |

## Evidencia consultada

Esta revisión no ha comprobado nada nuevo en el repo; se apoya en lo ya verificado
en v1/v2 y en la documentación de git y GitHub:

- `git receive-pack` (el lado que recibe un `push`) lee el `.git/config` del
  repositorio que recibe y ejecuta sus hooks. `git fetch` en cambio corre
  `upload-pack` en el otro lado, que no ejecuta hooks del repo remoto.
- Los commit status de GitHub van atados a un SHA: cada push nuevo los deja sin
  efecto y la protección de `main` vuelve a exigirlos.
- Un check obligatorio se exige a **todas** las PRs contra `main`, no solo a las
  que crea el CLI.
- Las etiquetas de GitHub no van atadas a un commit: sobreviven a los pushes.
- No verificado: si un token de API de Cloudflare con D1 de solo lectura puede
  listar `_cf_D1_MIGRATIONS` (R3-A).

## 1. Seguridad: cerrar antes de M2

### R1 — El estado vive donde escribe el agente

`.task/` está dentro del clon y el implementer lo monta en escritura (l.280). Ahí
viven hoy:

- `.task/state.json`: fase, rondas consumidas y la reserva del número de migración
  (l.639-640). El implementer puede reescribir la fase, resetear rondas o
  reservarse el número.
- El hash de `approve` (el plan no dice dónde se guarda; l.439). Si va en el clon,
  el implementer puede fabricarse una aprobación.
- `checks.md` y `review.md`, que `ship` y `pr-review` publican tal cual (l.148,
  l.657): el implementer puede editar el informe antes de que se publique. Redactar
  el propio informe no es grave, pero falsear «RED no verificado» sí envenena tu
  decisión.

- ★ El estado y las aprobaciones pasan al host: `~/.orquestator/ESQ-123/state.json`.
  Cada contenedor de fase monta solo lo que esa fase escribe: el implementer ve el
  brief y los informes anteriores en **solo lectura**, y su `.task` escribible se
  limita a lo suyo. `run` (host) es el dueño del estado. ~30 min de diseño; cambia
  los módulos `state`, `container` y `artifacts`.

### R2 — No hay forma de traer `main` nuevo al clon

El clon nace sin remoto (C2-A) y ningún paso lo actualiza. Con `--max-parallel N`
(l.681), otra tarea puede mergear y dejar esta rama atrasada o en conflicto con
`main`; la protección de `main` puede exigir ramas actualizadas y ahí se para todo,
sin paso definido.

La salida obvia —el host hace `git push` hacia el clon— queda descartada por N1:
`receive-pack` ejecuta los hooks del repo que recibe, y el `.git/config` del clon lo
escribe el agente.

- ★ Montar en el contenedor un **espejo bare de `main` en solo lectura**
  (`/upstream`, actualizado por el host con `git fetch origin` en el checkout
  principal). El worker hace `git fetch /upstream main` y el merge lo hace el
  implementer. `run` comprueba `gh pr view --json mergeable` antes de `In
  validation`; si hay conflicto → `fix --from conflicto` (implementer → check →
  review → push).
- Ampliar el test de configuración maliciosa (l.660-661) al camino de `fetch`:
  hooks y `uploadpack.packObjectsHook` del espejo no deben ejecutar nada (el espejo
  es de confianza, pero el test lo ata).

### R3 — El check `migracion` bloquea las PRs que no son del flujo

La protección de `main` exige `migracion` (l.154, l.151). Pero el status lo publica
el CLI, y solo para sus PRs. Consecuencias:

1. Tus PRs manuales —justo las de CI, que el plan manda «fuera del flujo» (l.443) —,
   Dependabot o cualquier otra PR se quedan sin el status y **no pueden mergear**.
2. El status va atado al SHA: cada push de `fix` lo invalida y hay que volver a
   publicarlo.
3. Un `fix` posterior podría cambiar una migración ya aplicada (el plan no lo
   trata; solo dice que una migración aplicada es inmutable, l.473).

- ★ **A.** Un job de CI `migracion` con un token de API de Cloudflare de **solo
  lectura**: pasa si el diff no toca `api/migrations/**`; si las toca, comprueba que
  estén aplicadas en la D1 remota. Cubre todas las PRs (del flujo, manuales y de
  Dependabot), es del propio CI (no puede mentir el CLI) y un push lo recalcula
  solo. El CLI deja de publicar el status. Requiere confirmar que el token de solo
  lectura puede listar las migraciones.
- **B.** El CLI publica el status también para PRs manuales (`migrate --pr N`) y lo
  repone tras cada push. Más piezas y sigue sin cubrir PRs de terceros.
- En los dos casos: si el hash de una migración ya aplicada cambia en la rama →
  `Blocked`.

### R4 — La etiqueta `guard:ok` no va atada a un commit

`ship` añade `guard:ok` a la PR (l.441). Las etiquetas sobreviven a los pushes: si
un `fix` posterior toca otra ruta protegida, la etiqueta sigue ahí y el job de CI de
M5b (l.754) daría por aprobado un diff que no lo está.

- ★ **A.** Cambiar la etiqueta por un **commit status `guard`**, como `migracion`:
  va atado al SHA, se invalida solo con cada push y el CLI lo repone tras
  comprobar el hash aprobado. El token ya necesita `Commit statuses: write` (l.327).
- **B.** Quedarse con la etiqueta, pero el CLI la quita antes de cada push y solo la
  vuelve a poner si el hash sigue valiendo.

## 2. Diseño

### G1 — El ratchet de cobertura «contra la base» no está definido

«Ratchet contra la base» (l.149, l.414, l.651) no dice cómo se obtiene el número de
la base. Las opciones naturales fallan: recalcular cobertura de `main` en cada
`check` y en la CI duplica el tiempo de tests, y un fichero de referencia no está en
las rutas protegidas (el implementer podría bajarlo).

- ★ Umbrales en la configuración que ya existe y ya está protegida:
  `coverage.thresholds` en `api/vitest.config.ts` y `web/vite.config.ts`. Subirlos
  es un cambio tuyo (ruta protegida); el ratchet es esa regla: los umbrales solo
  suben. Cero código nuevo y funciona igual en el CLI y en la CI.

### G2 — El lock de migraciones va en `start`, que no puede saberlo

`start` rechaza una segunda tarea con migración abierta o reserva el número
(l.639-640), pero al empezar una tarea todavía no se sabe si tocará migraciones.

- ★ Detectarlo en `check`, la primera vez que el diff toca `api/migrations/**`: si
  otra tarea tiene una migración abierta → `Blocked`. La reserva vive con el estado,
  en el host (R1).

### G3 — M0 y M3 traen piezas que el piloto no usa

- El **gateway MCP** entra en M3 (l.697-700) sin que ningún perfil tenga hoy un MCP
  necesario (sigue como pregunta abierta, l.799). Es superficie de ataque y trabajo
  sin demanda.
- El **provider de nan en el host** (M0, l.577): en el piloto Hermes solo corre
  dentro del contenedor; en el host no hay agente.
- El perfil **`verifier`** (l.240, l.695) es opcional y las comprobaciones son
  deterministas; nadie lo ha reclamado.

- ★ El gateway pasa a «cuando un perfil necesite un MCP» (M5b/M6). El provider se
  prueba en M1, a través del proxy, con la clave dummy. Quitar `verifier` del
  piloto. M0 baja media hora y M3 baja a ~2-3 horas.

### G4 — M2 vuelve a estar infraestimado

M2 (l.631, «2-3 días») acumula 13 comandos, 9 módulos, `run`, `watch`, `migrate`
con heurística y tests, el commit status `migracion`, el filtrado de comentarios, la
cobertura y el test de `diff.external`. Con D1-A se quitó el coordinador, pero entró
todo lo de N1-N5.

- ★ Sacar `watch` a M5b (el piloto lanza `run` a mano; el servicio de systemd ya
  está en M5b) y construir `migrate` solo si la feature del piloto lleva migración.
  Queda en ~3-4 días. Con todo dentro: 4-6 días.

Menor: tras el merge nadie lanza `clean` (el clon y el estado se acumulan en disco)
y no hay comprobación posterior al deploy. Basta con que `clean` corra las
comprobaciones de `DEPLOY.md` §7 y, si fallan, recuerde `wrangler rollback`
(`DEPLOY.md`, sección «Rollback»).

## 3. Restos de texto (~10 min)

| Línea | Problema | Corrección |
|---|---|---|
| 216, 386, 672 | El `pr-reviewer` corre «sin red», pero necesita el modelo (el proxy) | «Red interna, solo el proxy». `--network none` queda solo para `check` (l.615) |
| 383 | `fix --from check → … → push` también antes de que exista la PR | «→ check → review» mientras no haya PR |
| 476 | «Tu rechazo en `In validation` cuenta como ronda» choca con la l.454 (contador aparte) | «Cuenta como ronda humana» |
| 206 | El `spec-reviewer` corre «en el host, solo lectura» | En contenedor, como `pr-review`; el CLI publica los comentarios. Regla general: el host no ejecuta agentes (N1) |
| 577, 639-640 | El provider de nan en el host (M0) y la reserva en `.task/state.json` | Provider a M1 vía proxy; reserva al host con R1 y a `check` con G2 |

## Prioridad

1. **R1 + R2**: cambian `state`, `checkout`, `container` y el contrato de artefactos.
   Decidir antes de escribir M2. ~1 h de diseño.
2. **R3 + R4**: completan `migrate` y `guard`; R3-A toca la CI y M0 (token de
   Cloudflare de solo lectura).
3. **G1 + G2**: pequeños y quitan ambigüedad de M2.
4. **G3 + G4**: recortan alcance de M0, M2 y M3.
5. **Texto**: 5 correcciones de la tabla.

## Pendiente de verificar

- Que un token de API de Cloudflare con D1 de solo lectura puede listar las
  migraciones aplicadas (`_cf_D1_MIGRATIONS`): condiciona R3-A.
- `receive-pack` y los hooks del clon (R2) salen de la documentación de git; el test
  de configuración maliciosa es la verificación real.
- Si `wrangler preview` soporta D1, R2 y Cloudflare Access: sigue abierto desde la v1.
- La diversidad de modelos de nan para `reviewer` y `pr-reviewer` (M3).
