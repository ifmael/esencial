# ADR-0011 — Sistema de diseño Material 3 Expressive propio

- **Estado:** Aceptada
- **Fecha:** 2026-09-28

## Contexto

La app tenía un sistema visual anterior y pantallas con estilos escritos a mano.
El rediseño buscaba el lenguaje **Material 3 Expressive**: color tonal, formas
que cambian, muelles y tipografía variable. Las opciones eran quedarse con la
escala cruda de Tailwind, adoptar una biblioteca de componentes o construir el
sistema sobre los tokens del repo.

## Decisión

El sistema es **propio**, inspirado en Material 3 Expressive y apoyado en
Tailwind v4:

- `web/src/tokens.css` es generado desde la semilla `#15803d` con
  `web/scripts/gen-tokens.ts`; contiene los 32 roles de color en claro y oscuro.
  No se edita a mano.
- `web/src/globals.css` es la fuente única de forma, espaciado, elevación,
  movimiento y piel. `@theme inline` es el puente a Tailwind y
  `@layer components` la piel de las piezas.
- Las pantallas consumen primitivas de `components/ui.tsx`, `expressive.tsx` y
  `overlay.tsx`; no escriben piel ni usan la escala cruda de Tailwind.
- El catálogo vivo está en `/ui` y `web/scripts/check-design-tokens.ts` rechaza
  valores sueltos, clases de la escala anterior y piel escrita a mano.

Se descartó Material Web porque está en mantenimiento y no implementa
Expressive; se descartó una biblioteca de componentes de terceros porque
impediría el color por sección y los muelles propios.

## Alternativas

- **Tailwind por defecto:** es rápido al principio, pero no da roles tonales,
  muelles ni una forma única de construir las piezas; cada pantalla deriva.
- **Material Web:** implementa Material, pero no Expressive y su mantenimiento
  no garantiza el ritmo del rediseño.
- **Biblioteca de componentes externa:** ahorra piezas, pero impone su tema, su
  API y su accesibilidad; el color por sección y el morph de contenedor quedarían
  fuera.
- **Sistema propio sin tokens generados:** evita el generador, pero vuelve a
  valores sueltos y a la deriva que el lint quiere impedir.

## Consecuencias

- Hay que mantener tokens, primitivas, catálogo y lint; una pieza nueva empieza
  por el token y después por la primitiva.
- El CSS y la fuente auto-alojada pesan más que una escala de Tailwind; se acepta
  a cambio de la identidad visual y la consistencia.
- La accesibilidad (contraste AA, foco, tamaños táctiles y reducción de
  movimiento) queda en las reglas del sistema, no en cada pantalla.
- `wireframes/DESIGN.md` y `docs/architecture/diseno.html` son historia; donde
  discrepen, manda `web/src/globals.css`.

## Referencias

- `REDESIGN.md` (decisiones y desvíos del Rediseño G).
- `DESIGN-SYSTEM.md` y `web/src/globals.css`.
- `web/src/tokens.css` y `web/scripts/gen-tokens.ts`.
- `web/scripts/check-design-tokens.ts` y `web/src/routes/ui.tsx`.
- `AGENTS.md`, «Interfaz».
