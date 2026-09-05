# Verify Report — EP9 programar sesiones

Fecha: 2026-09-05 · Verificador: agente de revisión (dispatch task_9d034a45be6b)

## Resumen

**PASS.** Las 3 fases de verificación (suite, build, E2E manual) han ido
verdes. No se encontró ningún defecto funcional. Las diferencias visuales
frente al wireframe son menores y se listan como pendientes documentados.

## 1. Suite y build (tasks 4.1)

| Comando | Resultado |
|---|---|
| `pnpm test` | ✅ api 163/163, web 162/162 (20 archivos) |
| `pnpm build` | ✅ vite 8.2.2, 41 módulos, dist generado |

## 2. E2E manual con `pnpm dev` (task 4.2)

Arranque: `ESENCIAL_DEV_PASSWORD` fija vía `ensure-dev-vars.ts`; login OK
(`POST /api/auth/login` 200, cookie firmada). Estado inicial: D1 local vacía,
se creó plantilla "Empuje A" con 3 ejercicios (Aperturas con mancuernas,
Buenos días, Abducción de cadera en máquina) por API pública.

| Paso | Resultado |
|---|---|
| Login UI (`/login` → password → submit) | ✅ redirect a `/` |
| `/plan-fuerza` → "Programar" → input date nativo | ✅ bloque colapsable visible |
| Confirmar hoy (sesión ya existente) | ✅ 409 → "Ya hay una sesión ese día" inline |
| Confirmar otra fecha (2026-09-06) | ✅ 201 → "Programada para 2026-09-06", bloque se cierra |
| 400 (fecha mangleada durante la prueba) | ✅ "date must be YYYY-MM-DD" del envelope |
| `/` tarjeta FUERZA | ✅ badge "Pendiente", nombre "Empuje A", `<ol>` numerado con 3 ejercicios en orden de `position`, botón "Registrar sesión" |
| Reintento API misma fecha | ✅ `POST /api/plan-sessions` → 409 `{error, field:"date"}` |
| `GET /api/day/2026-09-05` | ✅ `session.exercises[]` ordenado por `position`, `summary: null` en planned |

## 3. Comparación con wireframe `esencial_hoy_desktop_v2`

Coincide: layout de 3 columnas RECETA / FUERZA / NOTAS DEL DÍA; tarjeta FUERZA
con nombre de sesión + badge PENDIENTE ámbar + lista numerada de ejercicios +
CTA verde "Registrar sesión" a ancho completo; navegación lateral igual.

Diferencias menores (ninguna bloquea):

1. El wireframe antepone "Sesión:" al nombre y coloca el badge a la derecha;
   la app muestra badge a la izquierda y el nombre sin prefijo.
2. El wireframe muestra "45 – 60 min" bajo el nombre; la app no tiene dato de
   duración (no existe en el modelo de `session_templates`).
3. La lista del wireframe usa círculos numerados con separadores en panel
   gris; la app usa `list-decimal` plano. Cosmético.
4. Estado RECETA vacío y placeholder de notas distintos al wireframe: son
   estados de datos vacíos preexistentes, fuera del alcance EP9.

## 4. Pendientes documentados

- **Commit (task 4.3):** la implementación sigue sin commitear (7 archivos
  modificados + `openspec/changes/2026-09-05-ep9-programar-sesiones/`).
  Sugerido: `feat(plan-fuerza): programar sesiones desde plantilla y ejercicios en tarjeta FUERZA`.
- Duración "45 – 60 min" del wireframe requiere añadir duración a la
  plantilla (nuevo dato de modelo); registrar como mejora futura si se quiere.
- El flujo "Registrar sesión" (logging del workout) pertenece a otro cambio;
  solo se verificó presencia del botón.
