# DESIGN.md — Esencial

Sistema de diseño de la app Esencial (bienestar personal: día, comidas, fuerza).
Formato compatible con Google Stitch (Settings → Design System → Import DESIGN.md).
Los prompts de pantallas NO necesitan repetir colores ni tipografías: Stitch aplica
este sistema a cada generación.

> **La implementación canónica son los tokens de `web/src/globals.css`.** Este
> fichero describe el mismo sistema para generar maquetas; si los dos discrepan,
> manda `globals.css`. Las reglas para añadir piezas están en `AGENTS.md`
> § "Sistema de diseño", y el catálogo de variantes vive en la ruta `/ui`.

## Brand

- App name: Esencial
- Personality: calm, clean, personal; health and daily-life focus
- Voice: warm, direct, short labels in Spanish

## Colors

- Primary: #15803D (acciones principales, estados completados)
- Primary Dark: #166534 (hover/pulsado)
- Primary Soft: #E9F3ED (fondo del elemento activo, hover suave)
- Primary Soft Strong: #D8EBDF (selección de texto)
- Secondary: #4D7C0F (acentos secundarios, progreso)
- Background: #FAFAF9 (fondo general)
- Surface: #FFFFFF (tarjetas)
- Surface Muted: #F5F5F4 (bloques secundarios dentro de tarjetas)
- Warning / Pending: #D97706 (estados pendientes, enlaces ámbar)
- Error: #B91C1C (solo errores y elementos descartados)
- Text Primary: #1C1917
- Text Secondary: #78716C
- Border: #E7E5E4
- Border Strong: #D6D3D1 (borde al pasar por encima)
- Ring: rgba(21,128,61,0.32) (halo de foco de los campos)

## Typography

- Font Family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
- Seis pasos, cada uno con su interlineado (y su tracking los extremos):

| Token | px | Para qué |
|---|---|---|
| display | 24 | título de pantalla (tracking -0.02em) |
| title | 20 | título de bloque |
| lead | 17 | el dato principal de una fila |
| body | 15 | texto de interfaz |
| caption | 13 | metadatos y ayudas |
| micro | 11 | etiquetas en mayúsculas e insignias (tracking 0.08em) |

- Los títulos llevan `letter-spacing` negativo en display; las micro-etiquetas, positivo.

## Spacing

- Base unit: 4px (la escala de Tailwind)
- Ritmo semántico: `stack` 12 (dentro de un bloque), `gutter` 16 (entre columnas),
  `card` 20 (padding de tarjeta), `section` 28 (entre secciones)
- Objetivo táctil mínimo: 44px

## Layout

- Mobile: barra inferior fija con 3 secciones (Hoy, Deporte, Nutrición); objetivo táctil min 44px; respeta `env(safe-area-inset-bottom)`
- Desktop (≥1024px, `lg`): barra lateral de 256px (marca + 3 secciones con submenús); contenido centrado con tope de 1200px
- Breakpoints: 640px (móvil→tableta), 768px, 1024px (tableta→escritorio, donde cambia la navegación)

## Components

- Card: bg Surface, border-radius 16px, border 1px solid #E7E5E4, sombra `shadow-card`, padding 20px
- Card interactiva: se levanta 1px al pasar por encima, vuelve al pulsar
- Primary button: bg Primary, text white, border-radius 10px, alto 44px, font-weight 600
- Secondary button: bg Surface, border 1px solid Border, text Primary-ish, border-radius 10px
- Ghost button: fondo transparente; al pasar, fondo Surface Muted
- Badge: border-radius 999px, font-size 11px, mayúsculas con tracking; pendiente (#FEF3C7/#92400E), hecho (#DCFCE7/#166534), neutro (#F5F5F4/#78716C)
- Input / textarea: border 1px solid Border, border-radius 10px, alto mínimo 44px, foco = borde Primary + halo `ring`
- Error de campo: `aria-invalid` → borde Error (el mismo atributo que anuncia el lector de pantalla)
- Foco: un único anillo `:focus-visible` de 2px en Primary con 2px de separación
- Effort scale (1-5): 5 puntos de 32px, seleccionado bg Primary, sin seleccionar borde #D6D3D1

## Motion

- Duraciones: `fast` 120ms (hover de controles), `base` 180ms (transform, sombra), `slow` 280ms (entrada)
- Un solo easing para todo lo que reacciona al usuario: `cubic-bezier(0.22, 1, 0.36, 1)`
- Entrada de contenido: `rise` (6px + opacidad) una sola vez; carga: barrido `shimmer`
- Todo se neutraliza con `prefers-reduced-motion: reduce`

## Do's and Don'ts

- Do: keep screens calm and scannable; one primary action per screen
- Do: use photos for recipes when available, neutral placeholder otherwise
- Do: reutiliza una primitiva; si no encaja, añade un token antes que un valor suelto
- Don't: use red except for errors/discarded items
- Don't: use more than 2 font weights per screen
- Don't: put destructive actions (delete recipe/exercise) near primary actions
- Don't: invent values outside the scale (`rounded-[7px]`, `text-[10px]`): `pnpm lint` los rechaza
