# Stitch prompts — Esencial wireframes (7 pantallas, según diagrama del usuario)

Prompts listos para pegar en [Google Stitch](https://stitch.withgoogle.com) (modo mobile).
Mantener el bloque "Style" idéntico en los 7 prompts para que Stitch conserve consistencia visual.
Generar primero la pantalla 1 (DÍA), validar el estilo, y arrastrar el mismo estilo al resto
("apply style to new generations").

Navegación (del diagrama a mano del usuario):
DÍA → RECETA X | DÍA → FUERZA DEL DÍA → EJERCICIO X
DÍA → PLAN RECETAS SEMANAL → RECETA X
DÍA → PLAN FUERZA (plantillas A/B) → EJERCICIO X

**Estilo común (pegar al final de cada prompt):**

```
Style: clean, calm personal wellness app; light background (#FAFAF9), soft cards with
subtle shadows, rounded corners (12px), one accent green (#15803D) for primary actions
and completion states, amber for pending items, red only for discarded/error. Typography:
system sans-serif. Mobile-first, generous touch targets (min 44px), bottom tab navigation
with 3 tabs: Today, Food, Training. Spanish UI labels.
```

---


## Pantalla 1 — DÍA (home)

```
Design a mobile app home screen called "Día" for a personal wellness app. Header: large
date title "Hoy — lunes 1 septiembre" with left/right arrows to navigate days and a
calendar icon to jump to any date. Under the header, two text-link buttons side by side:
"Plan recetas" and "Plan fuerza" (navigate to the weekly meal planner and the strength
plan screens). Section "RECETA": compact card per planned meal with recipe name and small
photo thumbnail if available; tapping a card opens the full recipe detail screen. Section
"FUERZA": one card with today's planned session (e.g. "Sesión: Empuje A"); if not logged
yet show amber "Pendiente" state with a primary button "Registrar sesión"; if logged show
green summary (exercises done, series, effort) — tapping opens the day's workout screen.
Section "NOTAS DEL DÍA": text area with the day's reflections (or empty state "Escribe
algo sobre hoy") with autosave indicator. Bottom tab bar: Hoy (active), Plan recetas,
Plan fuerza. Spanish UI labels.
```

## Pantalla 2 — RECETA X (detalle)

```
Design a mobile recipe detail screen for the same app. Top: full-width dish photo with
back button and the recipe name overlaid at the bottom of the image. Below, stacked
sections: short description text; "Ingredientes" as a checklist with quantity per serving
(e.g. "Arroz integral — 80 g"); "Elaboración" as numbered steps (1. 2. 3.) with generous
line height; "Materiales" as chips listing utensils (sartén, olla, batidora). A small
edit (pencil) icon in the header for editing the recipe. Keep the same style system.
```


## Pantalla 3 — FUERZA DEL DÍA (registro / lectura)

```
Design a mobile workout day screen for the same app, two states in one design. Header:
back button, date and assigned session name (e.g. "Empuje A"). State A (not logged):
list of exercises "Ejercicio 1: Press banca", "Ejercicio 2: Remo con barra"... each row
with checkboxes for its series; expanding an exercise shows per-series rows with numeric
steppers for weight (kg) and reps, prefilled with last session's values ("última: 57.5×8"
helper); at the end perceived effort as a 1-5 scale (large selectable dots "Muy fácil" a
"Máximo") and a free-text note; primary button "Cerrar sesión". State B (already logged):
same layout read-only, weights/reps as text, effort dots filled, "Registrado" badge in
header. Each exercise name is tappable and opens the exercise detail screen.
```


## Pantalla 4 — PLAN RECETAS SEMANAL + lista de compra

```
Design a mobile weekly meal planner screen for the same app (also used on desktop; show
the mobile version). A 7-day grid: rows = days of the week (L-D), columns = desayuno /
almuerzo / cena; empty slots show a dashed "+ añadir" that opens the recipe picker from
the recipe book; filled slots show recipe name + small thumbnail and TAP NAVIGATES to the
recipe detail screen (with a small edit/remove affordance). Sticky button "Lista de la
compra" that opens the generated shopping list: items grouped by supermarket section
(Frutas y verduras, Carnes, Lácteos, Despensa...) with quantities aggregated from the
recipes, checkbox per item, and a free-entry row "+ añadir artículo" at each section end.
```


## Pantalla 5 — RECETARIO (catálogo de recetas)

```
Design a mobile recipe book screen for the same app. Header "Recetario" with a search
field and a primary button "+ Nueva receta". List of recipes as horizontal cards:
thumbnail, name, short tag row (e.g. "almuerzo", "30 min", "batch"), tap opens recipe
detail. Include the "Nueva receta" editor as a second screen: form with photo upload,
name, ingredients rows (ingredient + amount + unit, addable), numbered steps (addable),
materials chips, and category tags.
```


## Pantalla 6 — EJERCICIO X (detalle)

```
Design a mobile exercise detail screen for the same app. Header: back button, exercise
name (e.g. "Press banca"). Body: large illustration/photo of the movement, description
text, muscle group tags (pecho, tríceps...), setup cues, and a YouTube button "Ver
técnica". Primary button "Añadir a plantilla" opening a picker of the user's session
templates (Empuje A, Tirón B...). Keep the same style system.
```

## Pantalla 7 — PLAN FUERZA (plantillas rotatorias)

```
Design a mobile strength plan screen for the same app. Header "Plan fuerza". List of
session templates as expandable cards: "A — Empuje", "B — Tirón", "C — Piernas"... each
showing its exercise list (rows with exercise name + target series), tap on an exercise
opens the exercise detail. Each template card has an edit mode: add exercise (opens
exercise picker with search), remove, reorder (drag handle), duplicate template; a
primary button "+ Nueva plantilla" at the bottom. Small hint of rotation order (A→B→C)
as chips at the top. Keep the same style system.
```

---

## Flujo de trabajo con Stitch

1. Generar pantalla 1 (DÍA) → validar estilo con el usuario.
2. Aplicar el mismo estilo y generar las 6 restantes.
3. Conectar pantallas en el canvas de Prototypes según la navegación del diagrama:
   DÍA → Receta X / Fuerza del día / Plan recetas / Plan fuerza; Fuerza → Ejercicio X;
   Plan recetas → Receta X; Plan fuerza → Ejercicio X.
4. Exportar: "Paste to Figma" para diseño navegable + código Tailwind como referencia de implementación.
5. Guardar export en este repo (`wireframes/`) y enlazar desde el sitio de gestión.
