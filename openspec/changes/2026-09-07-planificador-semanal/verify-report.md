```yaml
schema: gentle-ai.verify-result/v1
verdict: pass
blockers: 0
critical_findings: 0
requirements: 4/4
test_command: pnpm test
test_exit_code: 0
build_command: pnpm build
build_exit_code: 0
typecheck_command: pnpm typecheck
typecheck_exit_code: 0
```

## Verification Report

**Change**: planificador-semanal
**Version**: rejilla semanal de fuerza + desprogramación (DELETE plan-sessions)
**Mode**: Strict TDD (RED commit 8490277 verificado reproduciendo el fallo; GREEN 954316b api + 804c0de web)

### RED Evidence (reproducido en 8490277, 2026-09-07)

- `pnpm vitest run tests/plan-sessions-delete.test.ts` (api, en 8490277) → exit 1,
  **2 failed | 1 passed (3)**:
  - `planned → 200 {} y la fila desaparece`: `AssertionError: expected 404 to be 200`
  - `logged → 409 {error} y la fila permanece`: `AssertionError: expected 404 to be 409`
  - (`inexistente → 404` pasa trivialmente sin implementación — sin ruta DELETE, 404 genérico.)
- El commit 8490277 contiene solo tests (sin `.delete(` en
  `api/src/routes/plan-sessions.ts`, sin `web/src/lib/plan-week.ts`):
  RED real confirmado.
- `web/tests/plan-week.test.tsx` idéntico entre RED (8490277) y GREEN (804c0de)
  (md5 `bef6e093…` en ambos); la implementación del hook llega en 804c0de.

### Build & Tests Execution

| Check | Command | Exit | Result |
|-------|---------|------|--------|
| Unit suites | `pnpm test` (raíz) | 0 | api 178/178 (15 ficheros), web 171/171 (22 ficheros) |
| Typecheck (3 workspaces) | `pnpm typecheck` | 0 | api Done, web Done, e2e Done |
| Build | `pnpm build` | 0 | `tsc && vite build`, dist emitida (93.52 kB gzip JS) |

GREEN puntual de los ficheros nuevos: `plan-sessions-delete.test.ts` 3/3,
`plan-week.test.tsx` 6/6.

### Spec Compliance Matrix

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| Rejilla semanal | Añadir plantilla a un día | `SessionCell` vacía → `TemplatePicker` → `create` POST + badge "Pendiente"; 409 muestra "Ya hay una sesión ese día" (`plan-week.ts` msg → `role="alert"`) | ✅ COMPLIANT |
| Rejilla semanal | Hoy marcado | borde `border-primary/60` + etiqueta "Hoy" (`week-grid.tsx:122,225-229`) | ✅ COMPLIANT |
| Rejilla semanal | Navegación de semanas | ‹ › → `shiftIsoWeek` → `?week=` en URL; pasado/futuro libre (`plan-fuerza.tsx:792-793`) | ✅ COMPLIANT |
| Desprogramar planned | DELETE de sesión planned | API `200 {}` (`plan-sessions.ts:47-63`); ✕ → confirmación inline (patrón `confirming`) → `remove()` | ✅ COMPLIANT |
| Desprogramar planned | DELETE logged rechazado | `fail("Sesión ya registrada", undefined, 409)`; test 409 + fila permanece | ✅ COMPLIANT |
| Desprogramar planned | DELETE inexistente | `404 {"error":"Not found"}` (id inválido y no existente) | ✅ COMPLIANT |
| Celdas logged intocables | Badge Hecho | badge "Hecho", sin botón ✕ (`session.status === "planned"` condiciona la ✕) | ✅ COMPLIANT |
| Un solo camino a plan_sessions | Tarjeta sin Programar | grep `scheduling\|scheduled\|scheduleError\|Programar` en `web/src/` → **0 resultados**; bloque de ~60 líneas de `TemplateCard` eliminado | ✅ COMPLIANT |

**Compliance summary**: 4/4 requirements, 8/8 scenarios.

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Sin migraciones, `plan_sessions` intacto | ✅ | cero ficheros SQL en el diff |
| DELETE por fila (no PUT semanal) | ✅ | FK RESTRICT de `workout_logs` respetada: logged → 409 |
| GET completo + filtro ISO en cliente | ✅ | filtro Thursday-anchored en `usePlanWeek` (sin reloj) |
| Botón Programar eliminado (cutover limpio) | ✅ | único POST a plan-sessions es desde la rejilla |
| `guard`/`fail`/`parseId` en API | ✅ | reutiliza helpers existentes de `http.ts`, sin patrón paralelo |
| `.card`/`.btn-primary`/`.btn-secondary` en web | ✅ | rejilla y picker usan clases del sistema; `confirming` reutilizado |
| Copy español | ✅ | Pendiente/Hecho/Hoy/Confirmar desprogramar/Buscar plantilla… |
| Conventional commits, sin atribución IA | ✅ | `test(…)`, `feat(api)…`, `feat(web)…` |

### Issues Found

**CRITICAL**: None.
**WARNING**: None.
**SUGGESTION** (no bloqueante):
1. `e2e/tests/strength.spec.ts:79` mantiene un test cuyo nombre menciona
   "Programar" pero programa por API y valida la card de `/sesion` — sigue
   siendo correcto (el flujo de sesión no cambia); una ronda 2 podría añadir
   e2e de la rejilla.
2. `isoWeekOf` está espejado dentro de `web/src/lib/plan-week.ts` (comentado
   como "mirror of iso-week.ts") para filtrar en cliente sin importar el reloj;
   aceptable, pero unifica si crece el uso.

### Verdict

PASS — RED→GREEN evidenciado (fallo reproducido en 8490277, 404 vs 200/409;
verde tras las dos implementaciones). 349 tests unitarios verdes, typecheck
limpio en 3 workspaces, build verde. Cero dead code del bloque Programar;
patrones del repo respetados.

### E2E (ronda 2, 2026-09-07)

Nuevo describe `PLANIFICADOR SEMANAL` en `e2e/tests/strength.spec.ts`
(describe preexistente `STRENGTH — …` intacto), 5 tests:

| Test | Cubre |
|------|-------|
| añadir plantilla a un día desde la rejilla | Celda vacía → picker "Elegir plantilla" → badge "Pendiente" + ✕ |
| desprogramar con la ✕ (confirmación inline) | ✕ → "Confirmar desprogramar" → celda vuelve a "+ añadir" |
| error 409 visible al ocupar un día ocupado | POST interceptado 409 → `role="alert"` "Ya hay una sesión ese día", celda intacta |
| badge Hecho tras registrar una sesión | Flujo `/sesion` → rejilla muestra "Hecho", sin ✕ en logged |
| navegación de semanas | ‹ › actualiza heading y `?week=` en URL, ida y vuelta |

Command: `ESENCIAL_DEV_PASSWORD=hola npx playwright test tests/strength.spec.ts`
(desde `e2e/`, webServer auto con `pnpm dev`). Resultado: **10 passed**
(5 preexistentes de STRENGTH + 5 nuevos), 2 corridas consecutivas limpias
tras estabilizar (limpieza de leftovers con `clearDate`, asserts acotados a la
celda del día en vez de conteos globales de la rejilla, payload de plantilla
reutilizado del patrón existente `exercises/targetSets/targetRepsMin/Max`).
