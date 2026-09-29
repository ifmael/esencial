// SPA router (react-router 7, data mode). Shell wraps guarded routes.
// E7: on startup the app asks /api/auth/status; unauthenticated visitors are
// sent to /login?next=<path>. UX defense-in-depth — the server 401 gate stays
// authoritative (spec: Client-side session guard).
//
// Data mode (`createBrowserRouter` + `RouterProvider`) y no `<BrowserRouter>`:
// solo el router de datos envuelve la navegación en `startViewTransition`
// cuando un `<Link viewTransition>` o `navigate(…, { viewTransition })` lo
// pide. Las rutas son las mismas, declaradas como JSX.
import { useEffect, useState } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  ScrollRestoration,
  useLocation,
} from "react-router";
import { Shell } from "./components/shell";
import { apiFetchRaw } from "./lib/api";
import { DiaPage } from "./routes/dia";
import { LoginPage } from "./routes/login";
import { PlanFuerzaPage } from "./routes/plan-fuerza";
import { PlanRecetasPage } from "./routes/plan-recetas";

/** Layout route: one status check for the whole session, then Shell + page. */
function GuardedShell() {
  const { pathname, search } = useLocation();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetchRaw("/api/auth/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: { authenticated?: boolean } | null) =>
          alive && setAuthed(d?.authenticated === true),
      )
      // network error: treat as unauthenticated; the server gate is the backstop.
      .catch(() => alive && setAuthed(false));
    return () => {
      alive = false;
    };
  }, []);

  if (authed === null) return null; // checking: render nothing, avoid login flash
  if (!authed)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(pathname + search)}`}
        replace
      />
    );
  return (
    <Shell>
      <Outlet />
      {/* Página nueva arriba; «atrás» vuelve a donde estaba (data router). */}
      <ScrollRestoration />
    </Shell>
  );
}

import { AjustesPage } from "./routes/ajustes";
import { EjercicioDetailPage, EjerciciosPage } from "./routes/ejercicios";
import { PlantillaEditorPage, PlantillasPage } from "./routes/plantillas";
import { RecetaEditorPage } from "./routes/receta-editor";
import { RecetarioDetallePage, RecetarioPage } from "./routes/recetario";

import { SesionPage } from "./routes/sesion";
import { UiPage } from "./routes/ui";

const routes = createRoutesFromElements(
  <>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<GuardedShell />}>
      <Route path="/" element={<DiaPage />} />
      <Route path="/plan-recetas" element={<PlanRecetasPage />} />
      <Route path="/plan-fuerza" element={<PlanFuerzaPage />} />

      <Route path="/recetario" element={<RecetarioPage />} />
      <Route path="/recetario/nueva" element={<RecetaEditorPage />} />
      <Route path="/recetario/:id" element={<RecetarioDetallePage />} />
      {/* Editar es página propia, como crear: la ficha se desmonta al entrar. */}
      <Route path="/recetario/:id/editar" element={<RecetaEditorPage />} />
      <Route path="/ejercicios" element={<EjerciciosPage />} />
      <Route path="/ejercicios/:id" element={<EjercicioDetailPage />} />
      {/* Crear y editar son páginas propias: la lista se desmonta al entrar. */}
      <Route path="/plantillas" element={<PlantillasPage />} />
      <Route path="/plantillas/nueva" element={<PlantillaEditorPage />} />
      <Route path="/plantillas/:id/editar" element={<PlantillaEditorPage />} />

      <Route path="/sesion/:date" element={<SesionPage />} />

      <Route path="/ajustes" element={<AjustesPage />} />
      {/* Referencia del sistema de diseño: se llega desde Ajustes. */}
      <Route path="/ui" element={<UiPage />} />
    </Route>
  </>,
);

export function App() {
  // Un router por montaje (lee la URL al crearse), como hacía <BrowserRouter>.
  const [router] = useState(() => createBrowserRouter(routes));
  return <RouterProvider router={router} />;
}
