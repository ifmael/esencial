// SPA router (react-router 7, data mode). Shell wraps the app routes.
// La identidad la prueba Cloudflare Access en el borde; aquí no hay sesión que
// comprobar en el cliente: un fallo de sesión se resuelve recargando (ver
// lib/api.ts).
//
// Data mode (`createBrowserRouter` + `RouterProvider`) y no `<BrowserRouter>`:
// solo el router de datos envuelve la navegación en `startViewTransition`
// cuando un `<Link viewTransition>` o `navigate(…, { viewTransition })` lo
// pide. Las rutas son las mismas, declaradas como JSX.
import { useState } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Outlet,
  Route,
  RouterProvider,
  ScrollRestoration,
} from "react-router";
import { Shell } from "./components/shell";
import { DiaPage } from "./routes/dia";
import { PlanFuerzaPage } from "./routes/plan-fuerza";
import { PlanRecetasPage } from "./routes/plan-recetas";

/** Layout route: Shell + página + restauración de scroll. */
function AppShell() {
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
import { HistorialPage } from "./routes/historial";
import { PlantillaEditorPage, PlantillasPage } from "./routes/plantillas";
import { RecetaEditorPage } from "./routes/receta-editor";
import { RecetarioDetallePage, RecetarioPage } from "./routes/recetario";

import { SesionPage } from "./routes/sesion";
import { UiPage } from "./routes/ui";

const routes = createRoutesFromElements(
  <>
    <Route element={<AppShell />}>
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
      <Route path="/historial" element={<HistorialPage />} />

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
