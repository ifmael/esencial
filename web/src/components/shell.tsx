// E0 shell ported from legacy/next-app: desktop sidebar + mobile bottom tabs.
// Menú lateral con 3 secciones (Hoy, Deporte, Nutrición); Deporte y Nutrición
// son colapsables y despliegan su submenú. E7: logout button.
//
// Variante A (acabado): misma estructura —3 secciones, mismos submenús, mismos
// destinos— con el acabado del sistema: marca, iconos, pastilla de activo,
// transiciones cortas y una barra inferior con área táctil de 44px.
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { apiFetchRaw } from "../lib/api";
import {
  CalendarIcon,
  ChevronDownIcon,
  DumbbellIcon,
  LeafIcon,
  LogoutIcon,
  SwatchIcon,
  UtensilsIcon,
} from "./icons";

type NavChild = { href: string; label: string };
type NavSection = {
  key: string;
  href: string;
  label: string;
  icon: (props: { width?: number; height?: number }) => React.ReactNode;
  children?: NavChild[];
};

const NAV: NavSection[] = [
  { key: "hoy", href: "/", label: "Hoy", icon: CalendarIcon },
  {
    key: "deporte",
    href: "/plan-fuerza",
    label: "Deporte",
    icon: DumbbellIcon,
    children: [
      { href: "/ejercicios", label: "Ejercicios" },
      { href: "/plantillas", label: "Plantillas" },
    ],
  },
  {
    key: "nutricion",
    href: "/plan-recetas",
    label: "Nutrición",
    icon: UtensilsIcon,
    children: [{ href: "/recetario", label: "Recetas" }],
  },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

/** Rutas de calendario (fuerza y comidas): el calendario manda, así que la
 * página se queda sin cabecera y ocupa la ventana entera. Su submenú vive en el
 * menú lateral y, en móvil —donde no hay barra lateral—, en una fila fina sobre
 * la rejilla; abajo queda un hueco reservado para acciones futuras. */
const CALENDAR_ROUTES: Record<string, true> = {
  "/plan-fuerza": true,
  "/plan-recetas": true,
};

const sectionActive = (pathname: string, section: NavSection) =>
  isActive(pathname, section.href) ||
  (section.children ?? []).some((child) => isActive(pathname, child.href));

/** Fila de menú: 44px de alto. La pastilla de activo la pinta el contenedor
 * de la fila (`rowBox`) para que todas las filas acaben en el mismo borde,
 * tenga o no un botón de desplegar a su derecha. */
const rowClass = (active: boolean) =>
  [
    "flex h-11 items-center gap-3 rounded-control px-3 text-body",
    "transition-colors duration-150 ease-out-quart",
    active
      ? "font-semibold text-primary"
      : "font-medium text-text-secondary hover:bg-surface-muted hover:text-text",
  ].join(" ");

const rowBox = (active: boolean) =>
  [
    "flex items-center rounded-control",
    "transition-colors duration-150 ease-out-quart",
    active ? "bg-primary-soft" : "",
  ].join(" ");

/** Ítem de la barra inferior: icono + etiqueta, 44px de alto. `active` pinta la
 * pastilla; `current` marca `aria-current` (una sección con un submenú activo se
 * resalta, pero su href no es la página actual). */
function BarItem({
  href,
  label,
  icon: Icon,
  active,
  current = active,
}: {
  href: string;
  label: string;
  icon: NavSection["icon"];
  active: boolean;
  current?: boolean;
}) {
  return (
    <Link
      to={href}
      aria-current={current ? "page" : undefined}
      className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-panel px-1 py-1 text-micro font-semibold transition-colors duration-150 ease-out-quart ${
        active ? "text-primary" : "text-text-secondary"
      }`}
    >
      <span
        className={`grid size-9 place-items-center rounded-panel transition-colors duration-200 ease-out-quart ${
          active ? "bg-primary-soft" : ""
        }`}
      >
        <Icon />
      </span>
      {label}
    </Link>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // null = decide por ruta (auto-expandir la sección activa); true/false = el
  // usuario la colapsó/desplegó a mano.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const fullHeight = CALENDAR_ROUTES[pathname] === true;
  // Sección dueña de la ruta de calendario: su submenú es la fila fina de móvil.
  const navSection = NAV.find((section) => section.href === pathname);

  const logout = async () => {
    await apiFetchRaw("/api/auth/logout", { method: "POST" });
    navigate("/login");
  };

  const nav = NAV.map((section) => {
    const active = sectionActive(pathname, section);
    const SectionIcon = section.icon;
    if (!section.children) {
      return (
        <Link
          key={section.href}
          to={section.href}
          aria-current={isActive(pathname, section.href) ? "page" : undefined}
          className={rowBox(active)}
        >
          <span className={rowClass(active)}>
            <SectionIcon />
            {section.label}
          </span>
        </Link>
      );
    }
    const expanded = toggled[section.key] ?? active;
    const panelId = `nav-${section.key}`;
    return (
      <div key={section.href} className="flex flex-col">
        <div className={rowBox(active)}>
          <Link
            to={section.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 ${rowClass(active)}`}
          >
            <SectionIcon />
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
            className="-ml-1 mr-1 grid size-9 shrink-0 place-items-center rounded-control transition-colors duration-150 ease-out-quart hover:bg-surface-muted hover:text-text"
          >
            <ChevronDownIcon
              width={18}
              height={18}
              className={`transition-transform duration-200 ease-out-quart ${
                expanded ? "" : "-rotate-90"
              }`}
            />
          </button>
        </div>
        {expanded && (
          <ul
            id={panelId}
            className="mt-1 ml-5 flex flex-col gap-0.5 border-l border-border pl-2"
          >
            {section.children.map((child) => (
              <li key={child.href}>
                <Link
                  to={child.href}
                  aria-current={
                    isActive(pathname, child.href) ? "page" : undefined
                  }
                  className={rowClass(isActive(pathname, child.href))}
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
    <div
      className={`flex min-h-dvh flex-col lg:flex-row ${
        fullHeight ? "lg:h-dvh" : ""
      }`}
    >
      {/* Escritorio: barra lateral fija */}
      <aside
        className={`hidden w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface px-4 py-6 lg:flex ${
          fullHeight ? "lg:overflow-y-auto" : ""
        }`}
      >
        <Link
          to="/"
          className="flex items-center gap-3 rounded-control px-2 py-1 transition-colors duration-150 ease-out-quart hover:bg-surface-muted"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-panel bg-primary text-on-primary">
            <LeafIcon width={22} height={22} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-title font-bold tracking-tight text-primary">
              Esencial
            </span>
            <span className="text-caption text-text-secondary">
              Bienestar personal
            </span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">{nav}</nav>

        <div className="flex flex-col gap-1">
          <Link
            to="/ui"
            aria-current={isActive(pathname, "/ui") ? "page" : undefined}
            className={`flex h-11 items-center gap-3 rounded-control px-3 text-body font-medium transition-colors duration-150 ease-out-quart hover:bg-surface-muted hover:text-text ${
              isActive(pathname, "/ui") ? "text-primary" : "text-text-secondary"
            }`}
          >
            <SwatchIcon />
            Sistema de diseño
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex h-11 items-center gap-3 rounded-control px-3 text-body font-medium text-text-secondary transition-colors duration-150 ease-out-quart hover:bg-surface-muted hover:text-text"
          >
            <LogoutIcon />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main
        className={`mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-28 lg:px-8 lg:py-8 ${
          fullHeight ? "flex flex-col gap-4 lg:min-h-0" : ""
        }`}
      >
        {/* En móvil no hay barra lateral: los enlaces de la sección quedan
            como fila fina sobre el calendario. */}
        {fullHeight && navSection?.children ? (
          <nav
            aria-label={navSection.label}
            className="flex flex-wrap gap-1 lg:hidden"
          >
            {navSection.children.map((child) => (
              <Link
                key={child.href}
                to={child.href}
                className="rounded-chip bg-surface-muted px-3 py-1 text-caption font-semibold text-text-secondary transition-colors duration-150 ease-out-quart hover:bg-primary-soft hover:text-primary"
              >
                {child.label}
              </Link>
            ))}
          </nav>
        ) : null}

        {children}

        {fullHeight ? (
          // Hueco inferior reservado (acciones futuras del calendario).
          <div aria-hidden="true" className="hidden h-14 shrink-0 lg:block" />
        ) : null}
      </main>

      {/* Móvil: barra inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-up backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch px-2 py-1.5">
          {NAV.map((section) => (
            <BarItem
              key={section.href}
              href={section.href}
              label={section.label}
              icon={section.icon}
              active={sectionActive(pathname, section)}
              current={isActive(pathname, section.href)}
            />
          ))}
          <BarItem
            href="/ui"
            label="UI"
            icon={SwatchIcon}
            active={isActive(pathname, "/ui")}
          />
          <button
            type="button"
            onClick={logout}
            className="ml-1 flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-panel border-l border-border px-1 py-1 text-micro font-medium text-text-secondary transition-colors duration-150 ease-out-quart hover:text-text"
          >
            <span className="grid size-9 place-items-center">
              <LogoutIcon />
            </span>
            Salir
          </button>
        </div>
      </nav>
    </div>
  );
}
