# Revisión v4 del plan `TODO-flujo-agentes.md`

Fecha: 2026-10-21. Revisa la versión del plan con la revisión v3 adoptada (Bitácora
hasta «Revisión v3»). Las revisiones anteriores están en `REVIEW-flujo-agentes.md`,
`REVIEW-flujo-agentes-v2.md` y `REVIEW-flujo-agentes-v3.md`. ★ = alternativa
recomendada. Los números de línea son los del plan actual.

## Veredicto

**El plan está listo para empezar M0.** Los 8 puntos de la v3 (R1–R4 y G1–G4) y las
5 correcciones de texto entraron bien. Solo quedan **3 ajustes de lógica para M2**
(un interbloqueo y dos detalles de orden/montaje) y **4 erratas menores**; ninguno
bloquea M0 ni M1.

## Estado de la revisión v3

| Hallazgo v3                                                     | Estado    | Resto                                         |
| --------------------------------------------------------------- | --------- | --------------------------------------------- |
| R1 estado y aprobaciones en el host                             | Adoptado  | Detalle de montaje de `.task/` en Docker (A3) |
| R2 espejo bare `/upstream` + `mergeable`                        | Adoptado  | —                                             |
| R3-A job de CI `migracion` read-only                            | Adoptado  | Interbloqueo con `In validation` (A1)         |
| R4-A commit status `guard` atado al SHA                         | Adoptado  | Antes del push solo existe el hash local (A2) |
| G1 `coverage.thresholds` en configs protegidas                  | Adoptado  | —                                             |
| G2 lock de migraciones en `check`                               | Adoptado  | —                                             |
| G3 sin gateway MCP en el piloto, provider en M1, sin `verifier` | Adoptado  | —                                             |
| G4 `watch` a M5b, `migrate` condicional, M2 3-4 días            | Adoptado  | Falta marca `(M5b)` en la tabla de l.243      |
| 5 correcciones de texto de la v3                                | Adoptadas | —                                             |

## 1. Los 3 últimos ajustes de lógica (para M2)

### A1 — Interbloqueo entre el job `migracion` e `In validation` (l.154, 157, 732, 802)

- **Problema:** `pr-review` espera `gh pr checks` en verde **antes** de pasar la
  tarea a `In validation` (l.732). Pero `gh pr checks` incluye el job `migracion`
  (añadido en M0, l.620), que falla mientras la migración no esté aplicada en la D1
  remota… y las líneas 157 y 802 dicen que el CLI aplica la migración remota **en**
  `In validation`. Ninguno de los dos pasos puede ocurrir antes que el otro.
- ★ **Solución:** cuando `pr-review` termina sin críticos y `ci` + `lint` están en
  verde:
  1. Si el diff lleva migración y aún no tiene `approve --migracion`, la tarea pasa
     a `Blocked` pidiéndolo (o lo apruebas en TTY).
  2. Con `approve --migracion` dado, `run` ejecuta `migrate` (aplica en la D1
     remota con el token de edición) y re-ejecuta el job de CI `migracion`.
  3. Cuando `migracion` se pone en verde (todos los checks verdes), el CLI mueve la
     issue a `In validation`.
     En M5a el orden queda: migración de preview antes de `ship`/preview → `pr-review`
     → `approve --migracion` → migración remota → `In validation`.

### A2 — El commit status `guard` no puede existir antes del push (l.488, 509, 633)

- **Problema:** las líneas 488 y 509 dicen «no hay comprobaciones ni PR sin el
  status `guard`». Pero antes de `check` y antes de `ship` la rama aún no se ha
  empujado a GitHub, así que el SHA no existe en remoto y no se le puede publicar
  un commit status.
- ★ **Solución:** separar las dos fases del control:
  1. **En local (antes de `check` y de `ship`):** lo que exige el CLI es el **hash
     aprobado en `~/.orquestator/ESN-123/state.json`** (puesto por `approve` en
     TTY).
  2. **En remoto (en `ship` y en cada push de `fix`):** justo después del `git push`,
     si el hash aprobado sigue coincidiendo con el diff protegido, el CLI publica el
     commit status `guard` sobre ese SHA para que lo vean la protección de `main` y
     el job `guard` de M5b.

### A3 — Montaje de `.task/` en Docker y ficheros que faltan en la tabla (l.265-268, 303-308, 698-701)

- **Problema:**
  1.En Linux/Docker, si intentas montar en `:ro` un fichero que todavía no existe
  (p. ej. `review.md` o `checks.md` en la primera vuelta del `implementer`),
  Docker crea un **directorio** vacío en su lugar y rompe la escritura posterior.
  2. Si `.task/` vive dentro del clon y el `implementer` monta el clon en `:rw`, el
  directorio padre `.task/` es escribible por el `implementer`.
  3. En la tabla de las líneas 303-308 faltan `.task/human-feedback.md` (que lee el
  `implementer` en `fix --humano`), el diff de la PR que recibe el `pr-reviewer`
  (l.238, 730) y `brief.md`/`checks.md` como lectura del `pr-reviewer`.
- ★ **Solución:**
  1. Guardar los artefactos en el host en `~/.orquestator/ESN-123/task/` (junto a
     `state.json`, fuera del clon). Antes de lanzar cada contenedor, el CLI
     pre-crea vacíos los ficheros que aún no existan.
  2. Montar `~/.orquestator/ESN-123/task/` como directorio en **`:ro`** sobre
     `<clon>/.task`, y montar encima en **`:rw`** únicamente los ficheros que
     escribe esa fase. Así ningún contenedor puede crear, borrar ni renombrar
     ficheros ajenos en `.task/`.
  3. Completar la tabla de montajes:

  | Fase          | Clon                | `<clon>/.task/` (dir base `:ro`)                                                              |
  | ------------- | ------------------- | --------------------------------------------------------------------------------------------- |
  | `implementer` | `rw`; commitea      | `brief.md`, `review.md`, `checks.md`, `human-feedback.md` `ro`; `impl.md` y `pr-body.md` `rw` |
  | `check`       | `rw`; tests y caché | `impl.md` `ro`; `checks.md` `rw`                                                              |
  | `reviewer`    | `ro`                | `brief.md`, `impl.md`, `checks.md` `ro`; `review.md` `rw`                                     |
  | `pr-reviewer` | `ro`                | `brief.md`, `impl.md`, `checks.md`, `review.md`, `pr-diff.patch` `ro`; `pr-review.md` `rw`    |

## 2. Erratas menores de texto (~2 min)

| Línea | Dice                                                           | Debe decir                                                                                                     |
| ----- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 10    | `Última actualización: 2026-10-21 (revisión v2).`              | `Última actualización: 2026-10-21 (revisión v3).`                                                              |
| 243   | `orquestator-cli status [--watch]`                             | `orquestator-cli status [--watch (M5b)]` (como `spec (M5b)` en l.228)                                          |
| 536   | `Todos viven en .task/ dentro del clon y están en .gitignore.` | Con A3: viven en `~/.orquestator/ESN-123/task/`, se montan en `<clon>/.task/` y `.task/` sigue en `.gitignore` |
| 896   | `.github/workflows/ci.yml`: paso de cobertura.                 | `.github/workflows/ci.yml`: paso de cobertura, job `migracion` (M0) y job `guard` (M5b).                       |

## Pendiente de verificar (sin cambios respecto a la v3)

Ya recogido en la l.190 del propio plan:

- Si un token de API de Cloudflare con D1 de solo lectura puede listar
  `_cf_D1_MIGRATIONS` (en M0; si no, fallback R3-B).
- Si `wrangler preview` soporta D1, R2 y Cloudflare Access (en M5a).
- La diversidad de modelos de nan para `implementer`, `reviewer` y `pr-reviewer`
  (en M3).
