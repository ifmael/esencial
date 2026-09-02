# Tasks — E6 registro gym

> Stack: Hono Worker + D1 (`api/`), React+Vite SPA (`web/`), pnpm workspaces. Strict TDD: every 1.x–4.x task is RED (failing test committed first) → GREEN (minimum code). Test command per package: `pnpm --filter api test` / `pnpm --filter web test`.

## 1. API debt: normalize setLogSchema (clean break, design D3)

- [ ] 1.1 RED: rewrite `api/tests/sessions-logs.test.ts` POST fixtures to camelCase (`setIndex`, `weightKg`) — suite fails against current schema; add test asserting old snake_case payload → 400 with `field` referencing the missing camelCase key and zero `workout_logs` rows; keep 409/404/foreign-template-`sets` tests green-equivalent
- [ ] 1.2 GREEN: rename in `api/src/api-validation.ts` (`set_index`→`setIndex`, `weight_kg`→`weightKg`) and update bind sites in `api/src/routes/workout-logs.ts` only; `pnpm --filter api test` fully green; confirm no other file reads the old input names (grep `set_index`/`weight_kg` outside `schema.sql`/SQL strings)
- [ ] 1.3 RED+GREEN: contract test pinning the POST response echo (`sets[].setIndex`/`weightKg`/`done:boolean`) so the wire shape is locked both directions

## 2. Client plumbing

- [ ] 2.1 RED+GREEN: `web/src/lib/api.ts` — `apiGet`/`apiSend` typed fetch helper throwing `ApiError {error, field, status}` from the `{error, field?}` envelope (mocked fetch; covers 400-with-field, 409, network failure)
- [ ] 2.2 RED+GREEN: `useWorkoutDay(date)` hook — resolves state A vs B from plan-sessions + template + `last` prefills + (if logged) the workout log; exposes draft actions (setWeight/setReps/toggleDone/effort/note/expand) and `close()` POST with `pending` flag; snake-free camelCase payload builder; invalid-date and no-session branches
- [ ] 2.3 RED+GREEN: pure helpers — default set count (`target_sets ?? 3`), "última: {kg}×{reps}" formatter, note trim-to-null

## 3. Screen: state A (editable)

- [ ] 3.1 RED+GREEN: `/fuerza/:date` route mounted in `app.tsx`; header (back, Spanish date, template name); empty state for unscheduled/invalid date
- [ ] 3.2 RED+GREEN: exercise rows in `position` order with per-set checkboxes (`target_sets ?? 3`) and name link to exercise detail (route contract `/ejercicio/:id`; page owned by E4)
- [ ] 3.3 RED+GREEN: expanded exercise — weight/reps steppers with accessible labels, draft-only edits (zero fetch per keystroke), "última" helper per prefill result
- [ ] 3.4 RED+GREEN: effort radiogroup (5 dots, "Muy fácil"…"Máximo", ≥44px) + note textarea; "Cerrar sesión" disabled until effort selected
- [ ] 3.5 RED+GREEN: close flow — single in-flight POST (double-click guard), 201 → state B, 400 → banner with field + draft preserved, 409 → refetch into state B

## 4. Screen: state B (read-only)

- [ ] 4.1 RED+GREEN: logged-day render from `GET /api/workout-logs/:date`: text values (`—` for null), static checkboxes, dots filled to effort, note text, "Registrado" badge; assert zero interactive inputs and no submit button in the DOM

## 5. Verify & close

- [ ] 5.1 `pnpm test` and `pnpm build` green (root workspace scripts)
- [ ] 5.2 Smoke in `wrangler dev` + built SPA: schedule session → open `/fuerza/{today}` → prefill visible → fill 2×3 sets + effort + note → close → badge "Registrado"; reopen → read-only; second POST attempt → 409 → still state B
- [ ] 5.3 Mobile-first visual pass vs `wireframes/pantalla-3-fuerza-dia.txt` (both states; 360px + desktop table variant) at evaluation
- [ ] 5.4 Mark E6 done in `project-site/data.js` (roadmap + debt note "normalizar setLogSchema" resolved), archive change
