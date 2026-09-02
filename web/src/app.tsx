// SPA router (react-router 7, declarative mode). Shell wraps every route.
import { BrowserRouter, Route, Routes } from "react-router";
import { Shell } from "./components/shell";
import { DiaPage } from "./routes/dia";
import { PlanRecetasPage } from "./routes/plan-recetas";
import { PlanFuerzaPage } from "./routes/plan-fuerza";

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<DiaPage />} />
          <Route path="/plan-recetas" element={<PlanRecetasPage />} />
          <Route path="/plan-fuerza" element={<PlanFuerzaPage />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
