# Tasks — E0 scaffold

## 1. Scaffold
- [x] 1.1 create-next-app (TS, Tailwind, ESLint, App Router) at `app/` (root was non-empty: openspec/, project-site/, wireframes/ stay outside the bundle)
- [x] 1.2 `npm run dev` serves HTTP 200 (verified with curl)
- [x] 1.3 `data/` gitignored with `.gitkeep` (DB file itself deferred to E1)
- [x] 1.4 vitest + testing-library installed; `npm test` green (3/3)

## 2. Visual tokens
- [x] 2.1 DESIGN.md palette/radius mapped via Tailwind v4 `@theme` in `app/globals.css` (v4 has no tailwind.config by default)
- [x] 2.2 `.card`, `.btn-primary`, `.btn-secondary`, `.badge-pending`, `.badge-done` classes

## 3. Navigation shell
- [x] 3.1 `components/shell.tsx`: sidebar desktop + bottom tabs mobile (verified in browser)
- [x] 3.2 Routes `/`, `/plan-recetas`, `/plan-fuerza` with active state (browser-verified; component test pending as known gap)

## 4. Día placeholder
- [x] 4.1 Date header prev/next + es-ES formatting (helpers unit-tested 3/3)
- [x] 4.2 Empty-state sections RECETA / FUERZA / NOTAS DEL DÍA (browser-verified)

## 5. Verify & close
- [x] 5.1 `npm test` (3/3) and `npm run build` green
- [x] 5.2 Browser demo: prod build (next start) — hydration OK, date arrows navigate (mié→jue→mié verified). KNOWN: dev mode hydration lags in headless browser (Next 16/turbopack dev quirk, no impact on prod or real usage)
- [x] 5.3 project-site tree updated (E0 decidida); change archived to openspec/changes/archive/2026-09-02-e0-scaffold
