// Árbol de gestión del proyecto Esencial. Editar este archivo actualiza el sitio.
window.TREE = {
  title: "Proyecto Esencial",
  open: true,
  updated: "2026-09-02",
  children: [
    {
      title: "Meta — Definición del goal",
      status: "decidido",
      notes: [
        { kind: "decidido", text: "Objetivo: MVP usable de app web personal de bienestar, todo integrado en una sola app." },
        { kind: "decidido", text: "Nombre oficial de la app: Esencial." },
        { kind: "decidido", text: "Sin presupuesto ni tope de intentos: iterar hasta cumplir criterios." },
        { kind: "decidido", text: "Sitio de gestión (este site): estático, árbol jerárquico, subdirectorio del proyecto." },
      ],
    },
    {
      title: "Fase 1 — Descubrimiento y problema",
      status: "decidido",
      children: [
        {
          title: "Problema core",
          status: "decidido",
          notes: [{ kind: "nota", text: "El bienestar es global (comida, ejercicio, mente) pero las herramientas están fragmentadas; falta un único lugar que represente tu día." }],
        },
        { title: "Usuario objetivo: tú mismo (único usuario)", status: "decidido" },
        {
          title: "Propuesta de valor",
          status: "decidido",
          notes: [{ kind: "nota", text: "Un 'día' como punto de entrada (comida + entrenos + notas) más planificación de comidas y fuerza, accesible desde el móvil en el gym." }],
        },
        {
          title: "Hipótesis a validar con uso real",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "H1: un 'día' unificado reduce fricción frente a 2-3 apps separadas." },
            { kind: "decidido", text: "H2: anotar cargas/sensaciones en el gym desde el móvil es cómodo." },
            { kind: "decidido", text: "H3: la lista de la compra generada del plan semanal se usa de verdad." },
          ],
        },
        {
          title: "Riesgos",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "Sobrealcance: 'todo integrado' puede inflar el MVP." },
            { kind: "decidido", text: "Entrada de datos lenta en el gym → abandono." },
            { kind: "decidido", text: "Complejidad de despliegue/acceso móvil." },
          ],
        },
        {
          title: "Descartado en esta fase",
          status: "descartado",
          notes: [{ kind: "nota", text: "Entrevistas de usuarios, análisis de competencia formal, monetización." }],
        },
      ],
    },
    {
      title: "Fase 2 — Alcance del MVP (MoSCoW)",
      status: "decidido",
      notes: [
        { kind: "decidido", text: "Validado por el usuario con ajustes: ex-Should dentro del MVP; recetas con ingredientes, cantidades, pasos y materiales; app consumida en móvil Y laptop (responsive, primera clase ambos)." },
      ],
      children: [
        {
          title: "Must — entra en el MVP",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "Vista de día (hoy + navegable a cualquier fecha): comidas del día, sesión asignada, notas/reflexiones de texto libre." },
            { kind: "decidido", text: "Plan semanal de comidas flexible: cada día cualquier combinación de desayuno/almuerzo/cena, con slots opcionales." },
            { kind: "decidido", text: "Recetas completas: ingredientes con cantidades, pasos de elaboración y materiales/utensilios necesarios; lista de la compra generada del plan, agrupada por sección de súper + entradas libres." },
            { kind: "decidido", text: "Plantillas de sesión rotatorias con ejercicios base editables; asignación a día y ajuste de ejercicios en el día concreto." },
            { kind: "decidido", text: "Registro en el gym desde móvil: por serie (peso + reps), escala 1-5 de esfuerzo, campo libre." },
            { kind: "decidido", text: "Referencia de la última sesión del mismo ejercicio (registro crudo, sin gráficas)." },
            { kind: "decidido", text: "Persistencia en servidor + acceso desde móvil (LAN/Tailscale)." },
            { kind: "decidido", text: "[ex-Should] Edición cómoda de plantillas (duplicar sesión, reordenar ejercicios)." },
            { kind: "decidido", text: "[ex-Should] Histórico de sesiones navegable por fecha." },
            { kind: "decidido", text: "UI responsive: uso cotidiano desde móvil y laptop." },
          ],
        },
        {
          title: "Should — en cuanto el MVP básico arranque",
          status: "pendiente",
          notes: [
            { kind: "nota", text: "Protección con contraseña para acceder a la app (single-user; el modelo exacto —auth mínima del servidor— se decide en Fase 4)." },
          ],
        },
        {
          title: "Could — si aporta después",
          status: "pendiente",
          notes: [
            { kind: "nota", text: "Gráficas de progresión de cargas." },
            { kind: "nota", text: "Macros/calorías por receta." },
            { kind: "nota", text: "Exportación de datos." },
          ],
        },
        {
          title: "Won't — fuera de esta iteración (habilitables a futuro)",
          status: "descartado",
          notes: [
            { kind: "nota", text: "Multiusuario: fuera por ahora; la contraseña de acceso no implica cuentas múltiples." },
            { kind: "nota", text: "Integraciones con wearables y cálculo nutricional complejo: posibles features futuras cuando el producto madure." },
          ],
        },
        {
          title: "Método de desarrollo (transversal a fases)",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "OpenSpec + TDD para cada parte del plan de implementación: especificación antes de código, tests antes de implementación." },
            { kind: "decidido", text: "Iteración no one-shot: libertad de volver a cualquier fase, continuarla o modificarla; las fases son revisables." },
          ],
        },
      ],
    },
    {
      title: "Fase 3 — UX/UI",
      status: "decidido",
      notes: [
        { kind: "decidido", text: "Validada por el usuario (en global): 7 pantallas con navegación según su diagrama; wireframes generados en Stitch con DESIGN.md importado; export recibido (19 pantallas HTML+PNG)." },
      ],
      children: [
        {
          title: "Principios de UI",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "Mobile-first real: en el gym, todo el registro de una sesión con 2 dedos y sin recargar; en laptop, densidad (la semana entera visible)." },
            { kind: "decidido", text: "El 'día' es la home: fecha de hoy por defecto, navegación día anterior/siguiente y salto a cualquier fecha." },
            { kind: "decidido", text: "Toques mínimos: defaults inteligentes (último peso usado por serie, reps habituales) editables en un tap." },
            { kind: "decidido", text: "Elementos del día clicables: la tarjeta abre su detalle completo (receta, sesión)." },
          ],
        },
        {
          title: "Pantallas (7) y navegación",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "1. DÍA (home): enlaces 'Plan recetas' y 'Plan fuerza'; tarjeta RECETA de hoy → Receta X; tarjeta FUERZA → Fuerza del día; NOTAS DEL DÍA. Fecha navegable." },
            { kind: "decidido", text: "2. RECETA X: nombre, descripción + foto; ingredientes con cantidades; pasos numerados; materiales. Desde el día y desde el plan semanal." },
            { kind: "decidido", text: "3. FUERZA DEL DÍA: sesión del día; ejercicios con casillas; registro (series peso+reps, esfuerzo 1-5, nota) o lectura si registrado. Ejercicio → Ejercicio X." },
            { kind: "decidido", text: "4. PLAN RECETAS SEMANAL: grid 7 días × desayuno/almuerzo/cena; recetas enlazan a Receta X; lista de compra generada." },
            { kind: "decidido", text: "5. PLAN FUERZA: plantillas rotatorias (A, B...) con ejercicios; click → Ejercicio X; editar (añadir/quitar/reordenar, duplicar)." },
            { kind: "decidido", text: "6. EJERCICIO X: descripción + ilustración, grupos musculares, YouTube; añadible a plantillas." },
            { kind: "decidido", text: "7. RECETARIO: catálogo de recetas; alta/edición completa." },
          ],
        },
        {
          title: "Flujos clave",
          status: "decidido",
          notes: [
            { kind: "nota", text: "Planificar semana (laptop) → slots con recetas → lista de compra → móvil en el súper." },
            { kind: "nota", text: "Entrenar (móvil): día → sesión pendiente → series con defaults → cerrar con esfuerzo+nota." },
            { kind: "nota", text: "Reflexión diaria: nota libre en la vista del día." },
          ],
        },
        {
          title: "Wireframes con herramientas externas",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "Herramienta: Google Stitch con DESIGN.md importado. Export .zip (HTML/Tailwind) recibido y validado en wireframes/design/." },
          ],
        },
        {
          title: "Diseño dual móvil + escritorio",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "Cada pantalla en 2 variantes: móvil (tabs) y escritorio (sidebar + multi-columna). DESIGN.md como sistema visual (wireframes/DESIGN.md)." },
          ],
        },
        {
          title: "Descartado en esta fase",
          status: "descartado",
          notes: [{ kind: "nota", text: "Wireframes hechos a mano por el asistente sin herramienta visual." }],
        },
      ],
    },
    {
      title: "Fase 4 — Técnica y stack",
      status: "decidido",
      notes: [
        { kind: "decidido", text: "STACK ELEGIDO: Next.js full-stack (React) — API routes + front en un proyecto, TypeScript, Tailwind. SQLite (better-sqlite3) gestionada solo por API routes. Despliegue: LXC en Proxmox. SvelteKit descartado (futura app móvil sin ese framework)." },
      ],
      children: [
        {
          title: "Arquitectura (común a las opciones)",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "DOS piezas separadas: (1) BACKEND = API HTTP en el servidor: recibe peticiones, habla con SQLite y responde JSON. (2) FRONTEND = la web en tu navegador: NO toca la base de datos; solo llama a la API." },
            { kind: "decidido", text: "Ventaja clave: si mañana haces app Android/iOS, la app nativa consume LA MISMA API." },
            { kind: "nota", text: "SQLite: archivo data/esencial.db en el servidor; solo el backend lo abre. Backup = copiar el archivo." },
          ],
        },
        {
          title: "Opción 2 — Next.js full-stack (React) → ELEGIDA",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "API routes + front React en un solo proyecto; Tailwind (los wireframes de Stitch ya son Tailwind); shadcn/ui opcional." },
            { kind: "decidido", text: "v0 de Vercel puede generar pantallas React/shadcn compatibles para iteraciones futuras." },
          ],
        },
        {
          title: "Opciones 1 (Hono+Vite) y 3 (vanilla) descartadas",
          status: "descartado",
          notes: [{ kind: "nota", text: "El usuario prefirió el todo-en-uno de Next.js; vanilla demasiado manual para 7 pantallas." }],
        },
        {
          title: "App móvil futura (Android/iOS)",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "La futura app consumirá la misma API HTTP. React Native compartiría código con el front React; Kotlin/Flutter no. Decisión futura, no bloquea." },
          ],
        },
        {
          title: "Decisiones transversales",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "Datos: SQLite (better-sqlite3) gestionada SOLO por las API routes; esquema inicial en el change OpenSpec correspondiente." },
            { kind: "decidido", text: "Auth: contraseña única con cookie de sesión (middleware de Next); tras el MVP básico (Should)." },
            { kind: "decidido", text: "Fotos de recetas: ficheros en el servidor servidos estáticamente; subir desde el recetario." },
            { kind: "decidido", text: "Despliegue: LXC en Proxmox ejecutando el BFF — partida 1 en LAN + Tailscale; Cloudflare como partida 2. Docker dentro del LXC opcional." },
          ],
        },
      ],
    },
    {
      title: "Fase 5 — Plan de ejecución y roadmap",
      status: "decidido",
      notes: [
        { kind: "decidido", text: "Validada por el usuario. Renderizado: SPA (client-side); las API routes de Next actúan de BFF contra SQLite. Sin server rendering (sin SEO, single-user)." },
      ],
      children: [
        {
          title: "Épicas (OpenSpec + TDD por épica, una change por épica)",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "E0 — Andamiaje: Next.js + SQLite + `dev` + navegación (tabs/sidebar) con pantalla DÍA vacía. Demo: app arranca." },
            { kind: "decidido", text: "E1 — Modelo de datos + API CRUD. Demo: API probada con TDD." },
            { kind: "decidido", text: "E2 — Recetario + Receta X (CRUD con foto, ingredientes, pasos, materiales)." },
            { kind: "decidido", text: "E3 — Plan recetas semanal + lista de la compra generada." },
            { kind: "decidido", text: "E4 — Plan fuerza: catálogo de ejercicios + plantillas rotatorias." },
            { kind: "decidido", text: "E5 — Día (home): agrega comidas, sesión y notas del día; navegación por fecha." },
            { kind: "decidido", text: "E6 — Registro de entrenamiento móvil-first (series con defaults, esfuerzo 1-5, nota)." },
            { kind: "decidido", text: "E7 — Auth por contraseña + despliegue en LXC Proxmox + LAN/Tailscale." },
          ],
        },
        {
          title: "Criterio de done por épica",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "proposal → spec → design → tasks → apply (TDD) → verify; sitio de gestión actualizado tras cada decisión." },
            { kind: "decidido", text: "Cada épica cierra con demo verificable en navegador + change archivado." },
          ],
        },
      ],
    },
    {
      title: "Fase 6 — Go-to-market simplificado",
      status: "decidido",
      notes: [{ kind: "nota", text: "Validada: lanzamiento = uso diario real; bucle de feedback bugs/mejoras → roadmap; señales de éxito = H1-H3." }],
      children: [
        {
          title: "Lanzamiento = empezar a usarla tú",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "Sin lanzamiento comercial: el 'go-to-market' es pasar de MVP a uso diario real (despliegue E7 en el LXC, acceso desde móvil)." },
            { kind: "decidido", text: "Bucle de feedback: usas la app → anotas bugs y mejoras → vuelven al roadmap como iteraciones." },
            { kind: "decidido", text: "Señales de éxito = hipótesis de Fase 1: H1 día unificado, H2 registro gym cómodo, H3 lista de compra usada." },
          ],
        },
      ],
    },
    {
      title: "MVP — Implementación",
      status: "activo",
      notes: [{ kind: "nota", text: "E0 cerrada y archivada (openspec/changes/archive/2026-09-02-e0-scaffold). E1 en adelante: ciclo OpenSpec completo con agentes especializados (spec → validación del usuario → apply TDD → verify), orquestado; evaluación conjunta al cierre de cada épica." }],
      children: [
        {
          title: "E0 — Andamiaje",
          status: "decidido",
          notes: [
            { kind: "decidido", text: "Versiones (latest estables): Node 24.20.0 LTS Krypton · Next 16.3.4 · React 19.2.8 · Tailwind 4.3.3 · better-sqlite3 13.0.3 · TypeScript 5.9.3 · Vitest 4.1.11. App en subdirectorio app/." },
            { kind: "decidido", text: "SPA confirmada: build prerenderiza estático; las API routes serán el BFF (E1). data/esencial.db se crea en E1; en el LXC será bind mount con el mismo path." },
            { kind: "nota", text: "Hecho: navegación sidebar+tabs verificada, DÍA con fecha navegable y 3 secciones vacías, tokens DESIGN.md, tests 3/3, build verde. Interactividad verificada en producción (prod build): fecha navegable ← → OK. El modo dev de Next 16+turbopack tiene un retardo de hidratación en headless, no afecta a producción ni a uso real; se investigará si molesta en desarrollo." },
          ],
        },
        { title: "E1 — Modelo de datos + API", status: "decidido", notes: [
            { kind: "decidido", text: "Implementada por agente especializado con TDD (28 min): 13 rutas API BFF + esquema SQLite idempotente. 60 tests verdes, build verde, journey E2E verificado en producción por el orquestador: receta → plan → sesión → registro (409 en duplicado) → últimos valores (60×6) → borrado de receta deja slot vacío." },
            { kind: "decidido", text: "Fix crítico: serverExternalPackages better-sqlite3 (segfault del addon nativo bundlado). Deuda conocida: naming mixto en setLogSchema (templateExerciseId vs set_index) — normalizar en E6." },
        ] },
        {
          title: "CM1 — Migración a Cloudflare (Vite+React, Hono Workers, D1)",
          status: "decidido",
          notes: [{ kind: "decidido", text: "VERIFICADA EN PRODUCCIÓN por el usuario (deploy en workers.dev, 2026-09-02). Fix del database_id (72f807a). legacy/next-app/ borrado incl. BD de pruebas. Change archivado: openspec/changes/archive/2026-09-02-cm1-migracion-cloudflare. La app corre como un único Worker: SPA React+Vite + API Hono + D1." }],
        },
        { title: "E2 — Recetario + Receta X", status: "decidido", notes: [{ kind: "decidido", text: 'Implementado en worktree (1636577) e integrado. Búsqueda, detalle, editor crear/editar, borrado con confirmación; migración 0002 (photo_path + recipe_tags).' }] },
        { title: "E3 — Plan semanal + lista de compra", status: "decidido", notes: [{ kind: "decidido", text: 'Implementado (669faa7) e integrado. Rejilla 7×3 con navegación por semana, lista de la compra server-side (agrega por recetas N×, secciones, ítems manuales); migración 0003.' }] },
        { title: "E4 — Plan fuerza + catálogo", status: "decidido", notes: [{ kind: "decidido", text: "Implementado (778c323) e integrado. Plantillas con rotación, editor con reordenar, catálogo /ejercicios con detalle y 'Ver técnica'." }] },
        { title: "E5 — Día (home)", status: "decidido", notes: [{ kind: "decidido", text: 'Implementado (5b8aa06) e integrado. Agregación GET /api/day/:date, autosave de notas, estados vacíos con CTA.' }] },
        { title: "E6 — Registro gym móvil-first", status: "decidido", notes: [{ kind: "decidido", text: "Implementado (ff010d8) e integrado. /sesion/:date con prefill 'última', esfuerzo 1-5, cierre → read-only, 409; ruptura limpia a camelCase en sets. Deuda de naming snake→camel en inputs de ejercicios/plantillas RESUELTA (9514d33)." }] },
        { title: "E7 — Auth + hardening", status: "decidido", notes: [{ kind: "decidido", text: 'Implementado (af5a798) e integrado. Password + cookie HMAC, gate 401/302, rate-limit, headers; guard en SPA. run_worker_first. Verificado en smoke: login real 200 + recipes autenticado.' }] },
      ],
    },
  ],
};
