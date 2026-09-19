// E0 shell ported from legacy/next-app: desktop sidebar + mobile bottom tabs.
// Menú lateral con 3 secciones (Hoy, Deporte, Nutrición); Deporte y Nutrición
// son colapsables y despliegan su submenú. E7: logout button.
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

type NavChild = { href: string; label: string };
type NavSection = {
  key: string;
  href: string;
  label: string;
  children?: NavChild[];
};

const NAV: NavSection[] = [
  { key: "hoy", href: "/", label: "Hoy" },
  {
    key: "deporte",
    href: "/plan-fuerza",
    label: "Deporte",
    children: [
      { href: "/ejercicios", label: "Ejercicios" },
      { href: "/plantillas", label: "Plantillas" },
    ],
  },
  {
    key: "nutricion",
    href: "/plan-recetas",
    label: "Nutrición",
    children: [{ href: "/recetario", label: "Recetas" }],
  },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

const sectionActive = (pathname: string, section: NavSection) =>
  isActive(pathname, section.href) ||
  (section.children ?? []).some((child) => isActive(pathname, child.href));

export function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // null = decide por ruta (auto-expandir la sección activa); true/false = el
  // usuario la colapsó/desplegó a mano.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const linkClass = (active: boolean) =>
    active
      ? "text-white bg-primary rounded-lg px-3 py-2 font-semibold"
      : "text-text-secondary hover:text-text rounded-lg px-3 py-2 font-medium";

  const nav = NAV.map((section) => {
    const active = sectionActive(pathname, section);
    if (!section.children) {
      return (
        <Link
          key={section.href}
          to={section.href}
          aria-current={isActive(pathname, section.href) ? "page" : undefined}
          className={linkClass(active)}
        >
          {section.label}
        </Link>
      );
    }
    const expanded = toggled[section.key] ?? active;
    const panelId = `nav-${section.key}`;
    return (
      <div key={section.href} className="flex flex-col">
        <div className="flex items-center gap-1">
          <Link
            to={section.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 ${linkClass(active)}`}
          >
            {section.label}
          </Link>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={`${expanded ? "Contraer" : "Expandir"} ${section.label}`}
            onClick={() =>
              setToggled((t) => ({ ...t, [section.key]: !expanded }))
            }
            className="min-h-11 min-w-11 rounded-lg text-text-secondary hover:text-text"
          >
            <span aria-hidden>{expanded ? "▾" : "▸"}</span>
          </button>
        </div>
        {expanded && (
          <ul id={panelId} className="flex flex-col gap-1 pl-4">
            {section.children.map((child) => (
              <li key={child.href}>
                <Link
                  to={child.href}
                  aria-current={
                    isActive(pathname, child.href) ? "page" : undefined
                  }
                  className={`block ${linkClass(isActive(pathname, child.href))}`}
                >
                  {child.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  });

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 md:flex-col gap-2 border-r border-border bg-surface p-4">
        <div className="mb-4 text-xl font-bold text-primary">Esencial</div>
        <nav className="flex flex-col gap-1">{nav}</nav>
        <button
          type="button"
          className="btn-secondary mt-auto"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            navigate("/login");
          }}
        >
          Cerrar sesión
        </button>
      </aside>

      <main className="flex flex-1 flex-col p-4 pb-20 md:pb-4">{children}</main>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-border bg-surface p-2 md:hidden">
        {NAV.map((section) => (
          <Link
            key={section.href}
            to={section.href}
            aria-current={isActive(pathname, section.href) ? "page" : undefined}
            className={linkClass(isActive(pathname, section.href))}
          >
            {section.label}
          </Link>
        ))}
        <button
          type="button"
          className="rounded-lg px-3 py-2 font-medium text-text-secondary"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            navigate("/login");
          }}
        >
          Salir
        </button>
      </nav>
    </div>
  );
}
