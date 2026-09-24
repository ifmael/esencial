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
import { applyTheme, nextTheme, readTheme, type Theme } from "../lib/theme";
import { CommandPalette, useCommandPalette } from "./command-palette";
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DumbbellIcon,
  LeafIcon,
  LogoutIcon,
  MonitorIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  SwatchIcon,
  UtensilsIcon,
} from "./icons";
import { chipClass, Kbd } from "./ui";

const THEME_LABEL: Record<Theme, string> = {
  system: "Tema: sistema",
  light: "Tema: claro",
  dark: "Tema: oscuro",
};
const THEME_ICON: Record<Theme, typeof SunIcon> = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
};

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
 * página se queda sin cabecera y ocupa la ventana entera. La barra lateral se
 * pliega por defecto a un raíl de iconos —su ancho es para la rejilla— y el
 * submenú de la sección queda como fila de chips sobre el calendario; abajo, un
 * hueco reservado para acciones futuras. El botón de la cabecera del menú deja
 * al usuario desplegarla igualmente. */
const CALENDAR_ROUTES: Record<string, true> = {
  "/plan-fuerza": true,
  "/plan-recetas": true,
};

const sectionActive = (pathname: string, section: NavSection) =>
  isActive(pathname, section.href) ||
  (section.children ?? []).some((child) => isActive(pathname, child.href));

/** Plegado del menú lateral elegido por el usuario, recordado entre visitas.
 * Sin elección (null) decide la ruta: raíl en las de calendario. */
const MENU_PREF_KEY = "esencial.sidebar";

function readMenuPref(): "collapsed" | "expanded" | null {
  try {
    const value = localStorage.getItem(MENU_PREF_KEY);
    return value === "collapsed" || value === "expanded" ? value : null;
  } catch {
    return null; // almacenamiento bloqueado: manda la ruta
  }
}

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

/** Ítem del raíl (rutas de calendario): solo el icono, 44px de alto y ancho
 * completo del raíl; el nombre va en `aria-label`/`title`. */
const railItem = (active: boolean) =>
  [
    "grid h-11 w-full place-items-center rounded-control",
    "transition-colors duration-150 ease-out-quart",
    active
      ? "bg-primary-soft text-primary"
      : "text-text-secondary hover:bg-surface-muted hover:text-text",
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
  // Preferencia del usuario sobre el ancho del menú; sin elección, la ruta.
  const [menuPref, setMenuPref] = useState(readMenuPref);
  const [theme, setTheme] = useState(readTheme);
  const palette = useCommandPalette();
  const cycleTheme = () => {
    const next = nextTheme(theme);
    applyTheme(next);
    setTheme(next);
  };
  const ThemeIcon = THEME_ICON[theme];
  const calendarRoute = CALENDAR_ROUTES[pathname] === true;
  const collapsed =
    menuPref === null ? calendarRoute : menuPref === "collapsed";
  // Sección dueña de la ruta de calendario: su submenú es la fila fina de móvil.
  const navSection = NAV.find((section) => section.href === pathname);

  const logout = async () => {
    await apiFetchRaw("/api/auth/logout", { method: "POST" });
    navigate("/login");
  };

  const toggleMenu = () => {
    const next = collapsed ? "expanded" : "collapsed";
    setMenuPref(next);
    try {
      localStorage.setItem(MENU_PREF_KEY, next);
    } catch {
      // Sin persistencia (p. ej. almacenamiento bloqueado): la elección vive
      // solo en esta pestaña.
    }
  };

  const nav = NAV.map((section) => {
    const active = sectionActive(pathname, section);
    const SectionIcon = section.icon;
    if (collapsed) {
      return (
        <Link
          key={section.href}
          to={section.href}
          aria-label={section.label}
          title={section.label}
          aria-current={isActive(pathname, section.href) ? "page" : undefined}
          className={railItem(active)}
        >
          <SectionIcon />
        </Link>
      );
    }
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
        calendarRoute ? "lg:h-dvh" : ""
      }`}
    >
      {/* Escritorio: barra lateral fija, plegable por el usuario (su elección se
          recuerda). En raíl (~72px) cede el ancho a la rejilla: mismos destinos
          con su nombre en `aria-label`, y el submenú de la sección sobre el
          calendario (fila de chips). Por defecto se pliega en las rutas de
          calendario; el botón de la cabecera manda a partir de ahí. */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-border bg-surface py-6 lg:flex lg:overflow-y-auto ${
          collapsed ? "w-18 items-center gap-4 px-3" : "w-64 gap-6 px-4"
        }`}
      >
        <div
          className={`flex w-full ${
            collapsed ? "flex-col items-center gap-1" : "items-center gap-1"
          }`}
        >
          <Link
            to="/"
            aria-label={collapsed ? "Esencial" : undefined}
            title={collapsed ? "Esencial" : undefined}
            className={`flex items-center gap-3 rounded-control transition-colors duration-150 ease-out-quart hover:bg-surface-muted ${
              collapsed ? "justify-center p-1" : "min-w-0 flex-1 px-2 py-1"
            }`}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-panel border border-border bg-surface-muted text-primary">
              <LeafIcon width={18} height={18} />
            </span>
            {collapsed ? null : (
              <span className="flex min-w-0 flex-col">
                <span className="text-lead font-semibold tracking-tight text-text">
                  Esencial
                </span>
                <span className="font-mono text-micro text-text-secondary">
                  bienestar personal
                </span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggleMenu}
            aria-label={collapsed ? "Mostrar menú" : "Ocultar menú"}
            title={collapsed ? "Mostrar menú" : "Ocultar menú"}
            className="grid size-9 shrink-0 place-items-center rounded-control text-text-secondary transition-colors duration-150 ease-out-quart hover:bg-surface-muted hover:text-text"
          >
            {collapsed ? (
              <ChevronRightIcon width={18} height={18} />
            ) : (
              <ChevronLeftIcon width={18} height={18} />
            )}
          </button>
        </div>

        {collapsed ? (
          <button
            type="button"
            onClick={palette.show}
            aria-label="Buscar (⌘K)"
            title="Buscar (⌘K)"
            className={railItem(false)}
          >
            <SearchIcon />
          </button>
        ) : (
          <button
            type="button"
            onClick={palette.show}
            aria-label="Buscar (⌘K)"
            className="flex h-11 w-full items-center gap-2 rounded-control border border-border bg-surface-muted px-3 text-body text-text-secondary transition-colors duration-150 ease-out-quart hover:border-border-strong hover:text-text"
          >
            <SearchIcon width={16} height={16} />
            <span className="flex-1 text-left">Buscar…</span>
            <Kbd>⌘K</Kbd>
          </button>
        )}

        <nav className="flex w-full flex-1 flex-col gap-1">{nav}</nav>

        <div className="flex w-full flex-col gap-1">
          {collapsed ? (
            <>
              <button
                type="button"
                aria-label={THEME_LABEL[theme]}
                title={THEME_LABEL[theme]}
                onClick={cycleTheme}
                className={railItem(false)}
              >
                <ThemeIcon />
              </button>
              <Link
                to="/ui"
                aria-label="Sistema de diseño"
                title="Sistema de diseño"
                aria-current={isActive(pathname, "/ui") ? "page" : undefined}
                className={railItem(isActive(pathname, "/ui"))}
              >
                <SwatchIcon />
              </Link>
              <button
                type="button"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                onClick={logout}
                className={railItem(false)}
              >
                <LogoutIcon />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={cycleTheme}
                className="flex h-11 items-center gap-3 rounded-control px-3 text-body font-medium text-text-secondary transition-colors duration-150 ease-out-quart hover:bg-surface-muted hover:text-text"
              >
                <ThemeIcon />
                {THEME_LABEL[theme]}
              </button>
              <Link
                to="/ui"
                aria-current={isActive(pathname, "/ui") ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-control px-3 text-body font-medium transition-colors duration-150 ease-out-quart hover:bg-surface-muted hover:text-text ${
                  isActive(pathname, "/ui")
                    ? "text-primary"
                    : "text-text-secondary"
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
            </>
          )}
        </div>
      </aside>

      <main
        className={`mx-auto w-full flex-1 px-4 py-5 pb-28 lg:py-8 ${
          calendarRoute
            ? "flex max-w-calendar flex-col gap-4 lg:min-h-0 lg:px-6"
            : "max-w-6xl lg:px-8"
        }`}
      >
        {/* El menú lateral va en raíl (solo iconos): el submenú de la sección
            vive aquí, sobre el calendario, en escritorio y en móvil. */}
        {calendarRoute && navSection?.children ? (
          <nav aria-label={navSection.label} className="flex flex-wrap gap-1">
            {navSection.children.map((child) => (
              <Link key={child.href} to={child.href} className={chipClass()}>
                {child.label}
              </Link>
            ))}
          </nav>
        ) : null}

        {children}

        {calendarRoute ? (
          // Hueco inferior reservado (acciones futuras del calendario).
          <div aria-hidden="true" className="hidden h-14 shrink-0 lg:block" />
        ) : null}
      </main>

      {palette.open && (
        <CommandPalette onClose={palette.hide} onToggleTheme={cycleTheme} />
      )}

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
            onClick={palette.show}
            aria-label="Buscar (⌘K)"
            className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-panel px-1 py-1 text-micro font-medium text-text-secondary transition-colors duration-150 ease-out-quart hover:text-text"
          >
            <span className="grid size-9 place-items-center">
              <SearchIcon />
            </span>
            Buscar
          </button>
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
