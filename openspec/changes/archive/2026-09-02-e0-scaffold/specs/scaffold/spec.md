# Spec — E0 scaffold

## ADDED Requirements

### Requirement: Runnable dev command
The app MUST start in development mode with a single command (`npm run dev`) and serve the UI on localhost.

#### Scenarios
- Given the repository with dependencies installed, When the user runs `npm run dev`, Then an HTTP request to the served port returns the app shell with HTTP 200.

### Requirement: Navigation shell
The app MUST provide a navigation shell with three destinations — Hoy (home), Plan recetas, Plan fuerza — rendered as bottom tabs on mobile viewports and a left sidebar on desktop viewports.

#### Scenarios
- Given the app is open at `/`, When the viewport is mobile-sized, Then a bottom tab bar shows Hoy (active), Plan recetas, Plan fuerza.
- Given the app is open at `/`, When the viewport is desktop-sized, Then a left sidebar shows the three destinations with Hoy active.
- Given the user taps "Plan recetas", When navigation completes, Then the Plan recetas route renders with its tab/sidebar entry active.

### Requirement: Día screen placeholder
The home route (`/`) MUST render the Día screen placeholder with a navigable date header (title + prev/next day controls) and empty sections RECETA, FUERZA, NOTAS DEL DÍA, per the validated wireframe.

#### Scenarios
- Given the app is open at `/`, When the page renders, Then the date header shows today's date with prev/next controls, and the three sections render empty-state text.
- Given the user clicks the next-day arrow, When the header updates, Then the displayed date advances by one day (client state only).

### Requirement: Visual system tokens
Tailwind MUST expose the DESIGN.md palette (primary #15803D, pending amber, background #FAFAF9, surface white) and 12px card radius as theme tokens used by the shell.

#### Scenarios
- Given the app shell renders, When inspecting the primary action/tab-active color, Then it equals #15803D.
- Given a card is rendered, When inspecting its border radius, Then it equals 12px.

### Requirement: Database file location
SQLite MUST live at `data/esencial.db` (gitignored) and no application code outside future API routes may open it.

#### Scenarios
- Given E0 completes, When `git status` is clean after running the app, Then `data/` does not appear as tracked content.
