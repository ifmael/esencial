// Registro de sesión de gym — la pantalla real llega con E6. Este placeholder
// (ruta /sesion/:date) existe para que el CTA "Registrar sesión" del DÍA nunca
// sea un enlace muerto; E6 reemplaza este elemento.
import { useParams } from "react-router";

export function SesionPage() {
  const { date } = useParams<{ date: string }>();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Sesión {date ?? ""}</h1>
      <div className="card text-text-secondary">Pantalla de trabajo — llega con E6.</div>
    </div>
  );
}
