# Spec — E5 día (day screen + day endpoint)

## ADDED Requirements

### Requirement: Day aggregation endpoint

The API MUST expose `GET /api/day/:date` (date matching `YYYY-MM-DD`) returning, in one
JSON response, the day's planned meals, scheduled strength session, and day note. The
response MUST include `date`, `isoWeek` (`YYYY-Www`), `dayIndex` (integer 0–6, Monday = 0),
`meals` (this day's slot rows ordered desayuno → almuerzo → cena, each with `meal`,
`recipeId`, `recipeName`), `session` (`{ id, templateId, templateName, status, summary }`
or `null`), and `note` (`{ text }`, empty string when no note exists). A day with no plan,
no session, and no note MUST return 200 with empty data, not an error.

#### Scenarios
- Given week `2026-W36` has slots {day 1, desayuno, recipe 7} and {day 1, cena, recipe 9}, When `GET /api/day/2026-09-02` (a Tuesday), Then `meals` is exactly the two recipe-7 and recipe-9 entries in desayuno→cena order and no other day's slots appear.
- Given a meal slot whose recipe was deleted (slot reads empty via the E1 cascade rule), When the day is fetched, Then the slot appears with `recipeId: null` and `recipeName: null` and the response is still 200.
- Given no `week_plans` row exists for the date's ISO week, When the day is fetched, Then `meals` is `[]` and the response is 200.
- Given `plan_sessions` has a row for the date with template "Empuje A" and status `planned`, When the day is fetched, Then `session.status` is `"planned"`, `session.templateName` is `"Empuje A"`, and `session.summary` is `null`.
- Given the session for the date was closed via `POST /api/workout-logs/:date` with effort 3 and 20 sets across 5 exercises, When the day is fetched, Then `session.status` is `"logged"` and `session.summary` reports effort 3, exercises 5, sets 20.
- Given no session is scheduled for the date, When the day is fetched, Then `session` is `null`.
- Given a note "Buen día" saved via `PUT /api/notes/2026-09-02`, When the day is fetched, Then `note.text` is `"Buen día"`; with no note row, `note.text` is `""`.
- Given `:date` is `2026-9-2`, `not-a-date`, or empty, When `GET /api/day/:date`, Then the API responds 400 with envelope `{ "error": string, "field": "date" }`.
- Given the request is valid but the database fails, Then the response is the generic safe error (500 `{ error }`, no SQL internals), matching the E1 API contract.

### Requirement: ISO calendar mapping

The endpoint MUST map a date to `(isoWeek, dayIndex)` by ISO-8601 rules: Monday = 0 …
Sunday = 6, ISO week number by the Thursday rule, with the week's ISO year taken from the
date's week — not from the calendar year. The mapping MUST be a pure function of the
`YYYY-MM-DD` string; the Worker MUST NOT read the system clock.

#### Scenarios
- Given 2026-09-01 (a Tuesday), When mapped, Then `isoWeek` is `2026-W36` and `dayIndex` is `1`.
- Given 2026-12-31 (a Thursday in ISO week 53 of 2026), When mapped, Then `isoWeek` is `2026-W53`.
- Given 2027-01-01 (a Friday whose Thursday still falls in 2026), When mapped, Then `isoWeek` is `2026-W53` and `dayIndex` is `4`.
- Given 2026-09-06 (a Sunday), When mapped, Then `dayIndex` is `6` and `isoWeek` is `2026-W36` (Sunday belongs to the week that started Monday 2026-08-31).

### Requirement: Day screen layout and date navigation

The route `/` MUST render the DÍA screen per wireframe `pantalla-1-dia`: a date header
("Hoy — <weekday> <day> <month>" when the selected date is local today, otherwise the
formatted date), left/right arrows stepping one day (existing behavior preserved), a "Hoy"
control jumping back to local today, and a native date input for jumping to any date.
Below the header, quick links "Plan recetas" and "Plan fuerza". All section data comes from
a single `GET /api/day/:date` per selected date. Spanish UI labels.

#### Scenarios
- Given the app opens on 2026-09-02, When the header renders, Then the title starts with "Hoy" and includes the es-ES formatted date.
- Given the user presses → twice, When the date changes, Then `GET /api/day/2026-09-04` is requested (exactly one request per date) and the header shows the new date without the "Hoy" prefix.
- Given the user picks a date in the date input, When the value changes, Then the screen loads that date.
- Given the user returns to today via the "Hoy" control, When the date changes, Then the "Hoy" prefix is shown again.

### Requirement: Meals section (RECETA)

The RECETA section MUST list the day's planned meals from the endpoint, one compact card
per slot with a recipe, labeled with the meal name and recipe name, ordered desayuno →
almuerzo → cena. Each card MUST navigate to the recipe detail (`/plan-recetas/<recipeId>`).
When no slot has a recipe, the section MUST show the empty state "Aún no has planificado
comidas para este día" with a call to action linking to the weekly plan (`/plan-recetas`).

#### Scenarios
- Given the endpoint returns desayuno "Tortilla" and cena "Ensalada", When the section renders, Then exactly two cards appear in that order with meal label + recipe name, and an empty-slot (recipeId null) desayuno alongside a cena renders only the cena card.
- Given `meals` is empty, When the section renders, Then the empty state with the CTA link is shown — no error styling.
- Given the user taps the "Tortilla" card (recipeId 7), Then the app navigates to `/plan-recetas/7`.

### Requirement: Strength section (FUERZA)

The FUERZA section MUST render one of exactly three states from `session`: (a) `null` →
empty state "Sin sesión asignada" with a CTA link to `/plan-fuerza`; (b) `status "planned"`
→ template name with an amber Pending badge and a primary button "Registrar sesión"
navigating to `/sesion/<date>`; (c) `status "logged"` → green completion summary derived
from `session.summary` (effort, exercise count, set count) whose card also navigates to
`/sesion/<date>` (read-only view ships with E6).

#### Scenarios
- Given `session` is null, When the section renders, Then the empty state and the `/plan-fuerza` CTA appear; no "Registrar sesión" button is shown.
- Given `session.status` is `planned` with templateName "Empuje A", When rendered, Then the card shows "Empuje A", the badge uses the DESIGN.md pending tokens (amber #FEF3C7 / #92400E), and pressing "Registrar sesión" navigates to `/sesion/2026-09-02`.
- Given `session.status` is `logged` with summary `{ effort: 3, exercises: 5, sets: 20 }`, When rendered, Then a green completion card shows exercises, sets, and effort 3/5 and no "Registrar sesión" button.

### Requirement: Day notes section with autosave

The NOTAS DEL DÍA section MUST show a textarea seeded with the endpoint's `note.text` for
the selected date. Edits MUST persist via `PUT /api/notes/<date>` automatically after the
user stops typing (debounced, ≈800 ms), with a visible save indicator ("Guardando…",
"Guardado"). Switching dates MUST flush any pending save against the date being left — a
debounced save MUST NEVER write to the new date. Clearing the text and leaving it saves the
empty string. The PUT response (or GET on next fetch) is the source of truth for what is
stored.

#### Scenarios
- Given the user types "Sentado de más" and stops, When the debounce elapses, Then exactly one `PUT /api/notes/2026-09-02` with `{ "text": "Sentado de más" }` fires and the indicator reaches "Guardado".
- Given the user types and presses → (next day) before the debounce elapses, When the date changes, Then the pending text is saved against the previous date and the new date's textarea shows the new date's note.
- Given the textarea is empty on load, Then the placeholder "Escribe algo sobre hoy" is shown; typing nothing fires no PUT.
- Given `PUT` fails (network error), Then the indicator shows a failed state with retry and the typed text is preserved.

### Requirement: Loading, error, and retry states

While the day request is in flight the screen MUST show skeleton placeholders (not blank
sections). If the request fails, the screen MUST show one error card with a "Reintentar"
action that re-fetches the current date; navigation controls MUST remain usable so the user
can leave a broken day. No section may render stale data from a previous date while a new
date is loading.

#### Scenarios
- Given `GET /api/day/...` rejects, When the page loads, Then an error card with retry is visible and the date header still offers working prev/next.
- Given the user navigates dates quickly (prev, prev, next), When each date becomes current, Then the sections show only the current date's data (responses for superseded dates are discarded).

### Requirement: Design-system fidelity

All day-screen surfaces MUST use the existing DESIGN.md tokens: surface cards (12px radius,
#E7E5E4 border), primary green #15803D for primary actions, amber pending badge, green done
badge, red reserved for errors; mobile-first single column with sections stacking, desktop
multi-column per the wireframe's desktop variant; touch targets ≥ 44px.

#### Scenarios
- Given the viewport is mobile width, When the screen renders, Then sections stack in order RECETA → FUERZA → NOTAS and the Shell bottom tabs remain visible.
- Given a save action is in flight, Then its control reflects the pending state (indicator or disabled button) and duplicate submissions cause no extra writes.
