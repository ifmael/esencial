// SPA router (react-router 7, declarative mode). Shell wraps guarded routes.
// E7: on startup the app asks /api/auth/status; unauthenticated visitors are
// sent to /login?next=<path>. UX defense-in-depth — the server 401 gate stays
// authoritative (spec: Client-side session guard).
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { Shell } from "./components/shell";
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
    fetch("/api/auth/status")
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
    </Shell>
  );
}

import { EjercicioDetailPage, EjerciciosPage } from "./routes/ejercicios";
import { NuevaRecetaPage } from "./routes/nueva-receta";
import { RecetarioDetallePage, RecetarioPage } from "./routes/recetario";

import { SesionPage } from "./routes/sesion";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<GuardedShell />}>
          <Route path="/" element={<DiaPage />} />
          <Route path="/plan-recetas" element={<PlanRecetasPage />} />
          <Route path="/plan-fuerza" element={<PlanFuerzaPage />} />

          <Route path="/recetario" element={<RecetarioPage />} />
          <Route path="/recetario/nueva" element={<NuevaRecetaPage />} />
          <Route path="/recetario/:id" element={<RecetarioDetallePage />} />
          <Route path="/ejercicios" element={<EjerciciosPage />} />
          <Route path="/ejercicios/:id" element={<EjercicioDetailPage />} />

          <Route path="/sesion/:date" element={<SesionPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
