# DESIGN.md — Esencial

Sistema de diseño de la app Esencial (bienestar personal: día, comidas, fuerza).
Formato compatible con Google Stitch (Settings → Design System → Import DESIGN.md).
Los prompts de pantallas NO necesitan repetir colores ni tipografías: Stitch aplica
este sistema a cada generación.

## Brand

- App name: Esencial
- Personality: calm, clean, personal; health and daily-life focus
- Voice: warm, direct, short labels in Spanish

## Colors

- Primary: #15803D (acciones principales, estados completados)
- Primary Dark: #166534 (hover/pulsado)
- Secondary: #4D7C0F (acentos secundarios, progreso)
- Background: #FAFAF9 (fondo general)
- Surface: #FFFFFF (tarjetas)
- Surface Muted: #F5F5F4 (bloques secundarios dentro de tarjetas)
- Warning / Pending: #D97706 (estados pendientes, enlaces ámbar)
- Error: #B91C1C (solo errores y elementos descartados)
- Text Primary: #1C1917
- Text Secondary: #78716C
- Border: #E7E5E4

## Typography

- Font Family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
- Heading 1: 24px, 700 weight (título de pantalla, fecha del día)
- Heading 2: 18px, 600 weight (secciones: RECETA, FUERZA, NOTAS DEL DÍA)
- Body: 16px, 400 weight
- Caption: 13px, 400 weight (metadatos: "última: 57.5×8", horas)
- Line height: 1.5 body, 1.25 headings

## Spacing

- Base unit: 8px
- Values in use: 4, 8, 12, 16, 24, 32px
- Page padding (mobile): 16px
- Card padding: 16px
- Section gap: 24px

## Layout

- Mobile: bottom tab bar with 3 tabs (Hoy, Plan recetas, Plan fuerza); touch targets min 44px
- Desktop: left sidebar (Esencial logo + Hoy, Plan recetas, Plan fuerza); content max-width 1200px; multi-column layouts where the mobile screen stacks
- Breakpoints: 640px (mobile→tablet), 1024px (tablet→desktop)

## Components

- Card: bg Surface, border-radius 12px, border 1px solid #E7E5E4, shadow 0 1px 3px rgba(0,0,0,0.08), padding 16px
- Primary button: bg Primary, text white, border-radius 8px, padding 10px 16px, font-weight 600
- Secondary button: transparent bg, border 1px solid Primary, text Primary, border-radius 8px
- Pending badge: bg #FEF3C7, text #92400E, border-radius 999px, font-size 12px, uppercase
- Done badge: bg #DCFCE7, text #166534, border-radius 999px, font-size 12px, uppercase
- Input / text area: border 1px solid #D6D3D1, border-radius 8px, padding 10px, focus border Primary
- Checkbox: 20px, border-radius 6px, checked bg Primary
- Effort scale (1-5): 5 dots of 32px, selected dot bg Primary, unselected border #D6D3D1
- List row: 48px min height, divider 1px solid #E7E5E4

## Do's and Don'ts

- Do: keep screens calm and scannable; one primary action per screen
- Do: use photos for recipes when available, neutral placeholder otherwise
- Don't: use red except for errors/discarded items
- Don't: use more than 2 font weights per screen
- Don't: put destructive actions (delete recipe/exercise) near primary actions
