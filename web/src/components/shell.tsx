// Armazón de la app (M3 Expressive):
// - Escritorio: raíl de navegación M3E con el menú FAB arriba y el indicador
//   activo en pastilla (cambia de forma y la etiqueta gana peso). Fuera del
//   calendario el raíl se puede expandir a cajón con submenús; en las rutas de
//   calendario arranca colapsado (≤ 80 px, AGENTS.md) para ceder ancho.
// - Móvil: barra de navegación inferior M3 con área segura y FAB flotante.
// - Submenú de la sección en las rutas de calendario: grupo de botones
//   conectados sobre la rejilla.
// - Búsqueda ⌘K (search view M3), tema sistema/claro/oscuro y snackbar global.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { apiFetchRaw } from "../lib/api";
import { toISODate } from "../lib/day";
import { pushEscape } from "../lib/escape-stack";
import {
  applyTheme,
  followSystem,
  nextTheme,
  readTheme,
  type Theme,
} from "../lib/theme";
import { CommandPalette, useCommandPalette } from "./command-palette";
import {
  AddIcon,
  BookIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CloseIcon,
  ContrastIcon,
  DarkIcon,
  DumbbellIcon,
  HomeIcon,
  LeafIcon,
  LightIcon,
  ListIcon,
  LogoutIcon,
  SearchIcon,
  SwatchIcon,
  UtensilsIcon,
} from "./icons";
import { SnackbarHost } from "./overlay";
import { connectedClass, connectedItemClass, cx, Fab, ripple } from "./ui";

type IconType = typeof HomeIcon;
type NavChild = { href: string; label: string };
type NavSection = {
  key: "hoy" | "deporte" | "nutricion";
  href: string;
  label: string;
  icon: IconType;
  children?: NavChild[];
};

const NAV: NavSection[] = [
  { key: "hoy", href: "/", label: "Hoy", icon: HomeIcon },
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
 * página se queda sin cabecera y ocupa la ventana entera. El raíl arranca
 * colapsado y el submenú de la sección va como grupo conectado sobre la
 * rejilla; abajo, un hueco reservado para acciones futuras. */
const CALENDAR_ROUTES: Record<string, true> = {
  "/plan-fuerza": true,
  "/plan-recetas": true,
};

const FLOATING_TOOLBAR =
  /^\/(sesion\/|plantillas\/(nueva|\d+\/editar)$|recetario\/nueva$)/;

const sectionActive = (pathname: string, section: NavSection) =>
  isActive(pathname, section.href) ||
  (section.children ?? []).some((child) => isActive(pathname, child.href));

/** Sección de la ruta (su color: Deporte primary, Nutrición tertiary, Hoy
 * secondary). `/ui` y `/sesion` caen en la que les corresponde. */
function sectionOf(pathname: string): NavSection["key"] {
  if (pathname.startsWith("/sesion")) return "deporte";
  return (
    NAV.find((s) => s.key !== "hoy" && sectionActive(pathname, s))?.key ?? "hoy"
  );
}

/** Plegado del menú lateral elegido por el usuario, recordado entre visitas. */
const MENU_PREF_KEY = "esencial.sidebar";

function readMenuPref(): "collapsed" | "expanded" | null {
  try {
    const value = localStorage.getItem(MENU_PREF_KEY);
    return value === "collapsed" || value === "expanded" ? value : null;
  } catch {
    return null;
  }
}

const THEME_LABEL: Record<Theme, string> = {
  system: "Tema del sistema",
  light: "Tema claro",
  dark: "Tema oscuro",
};
const THEME_ICON: Record<Theme, IconType> = {
  system: ContrastIcon,
  light: LightIcon,
  dark: DarkIcon,
};

/** Destino del raíl colapsado: icono en una pastilla de 56×32 que se
 * ensancha al activarse (cambio de forma) y etiqueta debajo que gana peso. */
function RailItem({
  href,
  label,
  icon: Icon,
  active,
  current,
  compact,
}: {
  href: string;
  label: string;
  icon: IconType;
  active: boolean;
  current: boolean;
  /** Raíl de 80 px (calendario): la etiqueta va solo en aria-label/title. */
  compact: boolean;
}) {
  return (
    <Link
      to={href}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      aria-current={current ? "page" : undefined}
      className={cx(
        "group flex w-full flex-col items-center gap-1 py-1",
        active ? "text-on-surface" : "text-on-surface-variant",
      )}
      onPointerDown={ripple}
    >
      <span
        className={cx(
          "state grid h-8 place-items-center rounded-full transition-[width,background-color] motion-spatial-fast",
          active
            ? "w-14 bg-accent-container text-on-accent-container"
            : "w-8 group-hover:w-14",
        )}
      >
        <Icon filled={active} />
      </span>
      {compact ? null : (
        <span
          className={cx(
            "type-move text-label-m",
            active ? "font-extrabold" : "font-medium",
          )}
        >
          {label}
        </span>
      )}
    </Link>
  );
}

/** Fila del cajón expandido: 56 px, pastilla completa en activo. `fill` en
 * false cuando la pastilla la pinta el contenedor (sección con desplegable). */
const drawerRow = (active: boolean, fill = active) =>
  cx(
    "state flex h-14 items-center gap-3 rounded-full px-4 text-label-l type-move transition-colors motion-effects",
    fill && "bg-accent-container",
    active
      ? "font-extrabold text-on-accent-container"
      : "font-semibold text-on-surface-variant",
  );

/** Menú FAB (M3E): el FAB se transforma en un botón de cerrar redondo y
 * despliega las acciones de crear como píldoras apiladas. */
function FabMenu({
  extended,
  placement,
}: {
  extended: boolean;
  placement: "rail" | "float";
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    return pushEscape(() => setOpen(false));
  }, [open]);
  const items = [
    {
      label: "Sesión de hoy",
      icon: DumbbellIcon,
      section: "deporte",
      go: () => navigate(`/sesion/${toISODate(new Date())}`),
    },
    {
      label: "Plantilla",
      icon: ListIcon,
      section: "deporte",
      go: () => navigate("/plantillas/nueva", { viewTransition: true }),
    },
    {
      label: "Receta",
      icon: BookIcon,
      section: "nutricion",
      go: () => navigate("/recetario/nueva", { viewTransition: true }),
    },
  ] as const;
  return (
    <div
      // `relative` y `fixed` a la vez: gana el que Tailwind emita después
      // (relative), y el FAB flotante acababa al final del documento.
      className={
        placement === "float"
          ? "fixed right-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-30 lg:hidden"
          : "relative"
      }
    >
      <Fab
        aria-label={open ? "Cerrar menú de crear" : "Crear"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        // FAB → formulario: el FAB y el formulario de destino comparten
        // nombre de transición; en la ruta de destino el FAB lo suelta, porque
        // dos nombres iguales en la misma foto anulan la transición.
        style={{
          viewTransitionName:
            open || pathname.endsWith("/nueva") ? undefined : "fab",
        }}
        className={cx(extended && !open ? "px-5" : "w-14 px-0")}
      >
        {open ? <CloseIcon /> : <AddIcon />}
        {extended && !open ? <span className="text-label-l">Crear</span> : null}
      </Fab>
      {open ? (
        <div
          role="menu"
          aria-label="Crear"
          className={cx(
            "stagger absolute z-40 flex flex-col gap-1",
            placement === "rail"
              ? "top-16 left-0 items-start"
              : "right-0 bottom-16 items-end",
          )}
        >
          {items.map((item, i) => (
            <div key={item.label} style={{ ["--i" as string]: i }}>
              <button
                type="button"
                role="menuitem"
                data-section={item.section}
                onClick={item.go}
                onPointerDown={ripple}
                className="state flex h-14 items-center gap-3 rounded-full bg-accent-container pr-6 pl-4 text-title-m whitespace-nowrap text-on-accent-container shadow-2"
              >
                <item.icon />
                {item.label}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [menuPref, setMenuPref] = useState(readMenuPref);
  const calendarRoute = CALENDAR_ROUTES[pathname] === true;
  const collapsed =
    menuPref === null ? calendarRoute : menuPref === "collapsed";
  // Raíl compacto de 80 px (sin etiquetas) solo en el calendario; el resto del
  // tiempo el raíl colapsado mide 96 px con etiquetas, como pide M3E.
  const compact = collapsed && calendarRoute;
  const navSection = NAV.find((section) => section.href === pathname);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const palette = useCommandPalette();
  const section = sectionOf(pathname);

  useEffect(() => followSystem(readTheme), []);

  const cycleTheme = () => {
    const next = nextTheme(theme);
    applyTheme(next);
    setTheme(next);
  };
  const ThemeIcon = THEME_ICON[theme];

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
      // Sin persistencia: la elección vive solo en esta pestaña.
    }
  };

  const utility = [
    {
      key: "search",
      label: "Buscar (⌘K)",
      icon: SearchIcon,
      onClick: palette.show,
    },
    {
      key: "theme",
      label: THEME_LABEL[theme],
      icon: ThemeIcon,
      onClick: cycleTheme,
    },
  ];

  const rail = (
    <nav
      aria-label="Principal"
      className="flex w-full flex-1 flex-col items-center gap-3"
    >
      {NAV.map((s) => (
        <div key={s.key} data-section={s.key} className="w-full">
          <RailItem
            href={s.href}
            label={s.label}
            icon={s.icon}
            active={sectionActive(pathname, s)}
            current={isActive(pathname, s.href)}
            compact={compact}
          />
        </div>
      ))}
    </nav>
  );

  const drawer = (
    <nav aria-label="Principal" className="flex w-full flex-1 flex-col gap-1">
      {NAV.map((s) => {
        const active = sectionActive(pathname, s);
        const Icon = s.icon;
        if (!s.children) {
          return (
            <Link
              key={s.key}
              data-section={s.key}
              to={s.href}
              aria-current={isActive(pathname, s.href) ? "page" : undefined}
              className={drawerRow(active)}
              onPointerDown={ripple}
            >
              <Icon filled={active} />
              {s.label}
            </Link>
          );
        }
        const expanded = toggled[s.key] ?? active;
        const panelId = `nav-${s.key}`;
        return (
          <div key={s.key} data-section={s.key} className="flex flex-col gap-1">
            <div
              className={cx(
                "flex items-center rounded-full",
                active && "bg-accent-container text-on-accent-container",
              )}
            >
              <Link
                to={s.href}
                aria-current={active ? "page" : undefined}
                className={cx(drawerRow(active, false), "flex-1")}
                onPointerDown={ripple}
              >
                <Icon filled={active} />
                {s.label}
              </Link>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-label={`${expanded ? "Contraer" : "Expandir"} ${s.label}`}
                onClick={() =>
                  setToggled((t) => ({ ...t, [s.key]: !expanded }))
                }
                className="state mr-1 grid size-12 shrink-0 place-items-center rounded-full"
              >
                <ChevronDownIcon
                  className={cx(
                    "transition-transform motion-spatial-fast",
                    !expanded && "-rotate-90",
                  )}
                />
              </button>
            </div>
            {expanded && (
              <ul id={panelId} className="stagger ml-6 flex flex-col gap-1">
                {s.children.map((child, i) => {
                  const on = isActive(pathname, child.href);
                  return (
                    <li key={child.href} style={{ ["--i" as string]: i }}>
                      <Link
                        to={child.href}
                        aria-current={on ? "page" : undefined}
                        className={cx(
                          "state flex h-12 items-center rounded-full px-4 text-label-l type-move transition-colors motion-effects",
                          on
                            ? "bg-secondary-container font-extrabold text-on-secondary-container"
                            : "font-medium text-on-surface-variant",
                        )}
                        onPointerDown={ripple}
                      >
                        {child.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <SnackbarHost>
      <div
        data-section={section}
        className={cx(
          "flex min-h-dvh flex-col bg-surface lg:flex-row",
          calendarRoute && "lg:h-dvh",
        )}
      >
        <aside
          className={cx(
            "hidden shrink-0 flex-col bg-surface py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:overflow-y-auto transition-[width] motion-spatial",
            collapsed
              ? compact
                ? "w-20 items-center gap-6 px-2"
                : "w-24 items-center gap-6 px-2"
              : "w-72 gap-6 px-3",
          )}
        >
          <div
            className={cx(
              "flex w-full",
              collapsed ? "flex-col items-center gap-3" : "items-center gap-1",
            )}
          >
            <button
              type="button"
              onClick={toggleMenu}
              aria-label={collapsed ? "Mostrar menú" : "Ocultar menú"}
              title={collapsed ? "Mostrar menú" : "Ocultar menú"}
              className="state grid size-12 shrink-0 place-items-center rounded-full text-on-surface-variant"
            >
              {collapsed ? <ListIcon /> : <ChevronLeftIcon />}
            </button>
            <Link
              to="/"
              aria-label={collapsed ? "Esencial" : undefined}
              title={collapsed ? "Esencial" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-full",
                collapsed ? "justify-center" : "min-w-0 flex-1 px-2",
              )}
            >
              {collapsed ? null : (
                <span className="flex min-w-0 items-center gap-2 text-primary">
                  <LeafIcon filled />
                  <span className="text-title-l text-e">Esencial</span>
                </span>
              )}
            </Link>
          </div>

          <div
            className={cx("flex w-full", collapsed ? "justify-center" : "px-1")}
          >
            <FabMenu extended={!collapsed} placement="rail" />
          </div>

          {collapsed ? rail : drawer}

          <div
            className={cx(
              "flex w-full flex-col gap-1",
              collapsed && "items-center",
            )}
          >
            {collapsed ? (
              <>
                {utility.map((u) => (
                  <button
                    key={u.key}
                    type="button"
                    aria-label={u.label}
                    title={u.label}
                    onClick={u.onClick}
                    className="state grid size-12 place-items-center rounded-full text-on-surface-variant"
                  >
                    <u.icon />
                  </button>
                ))}
                {compact ? null : (
                  <>
                    <Link
                      to="/ui"
                      aria-label="Sistema de diseño"
                      title="Sistema de diseño"
                      aria-current={
                        isActive(pathname, "/ui") ? "page" : undefined
                      }
                      className="state grid size-12 place-items-center rounded-full text-on-surface-variant"
                    >
                      <SwatchIcon filled={isActive(pathname, "/ui")} />
                    </Link>
                    <button
                      type="button"
                      aria-label="Cerrar sesión"
                      title="Cerrar sesión"
                      onClick={logout}
                      className="state grid size-12 place-items-center rounded-full text-on-surface-variant"
                    >
                      <LogoutIcon />
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  aria-label="Buscar (⌘K)"
                  onClick={palette.show}
                  className="state flex h-14 items-center gap-3 rounded-full bg-surface-container-high px-4 text-body-l text-on-surface-variant"
                >
                  <SearchIcon />
                  <span className="flex-1 text-left">Buscar…</span>
                  <kbd className="text-label-m">⌘K</kbd>
                </button>
                <button
                  type="button"
                  onClick={cycleTheme}
                  className={drawerRow(false)}
                >
                  <ThemeIcon />
                  {THEME_LABEL[theme]}
                </button>
                <Link
                  to="/ui"
                  aria-current={isActive(pathname, "/ui") ? "page" : undefined}
                  className={drawerRow(isActive(pathname, "/ui"))}
                >
                  <SwatchIcon filled={isActive(pathname, "/ui")} />
                  Sistema de diseño
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className={drawerRow(false)}
                >
                  <LogoutIcon />
                  Cerrar sesión
                </button>
              </>
            )}
          </div>
        </aside>

        <main
          className={cx(
            "mx-auto w-full flex-1 px-4 pt-4 pb-32 lg:py-8",
            calendarRoute
              ? "flex max-w-calendar flex-col gap-4 lg:min-h-0 lg:px-6"
              : "max-w-6xl lg:px-8",
          )}
        >
          {/* Móvil: barra de búsqueda M3 arriba (abre la search view). */}
          <div className="mb-4 flex items-center gap-2 lg:hidden">
            <button
              type="button"
              aria-label="Buscar (⌘K)"
              onClick={palette.show}
              className="state flex h-14 min-w-0 flex-1 items-center gap-3 rounded-full bg-surface-container-high px-4 text-body-l text-on-surface-variant"
            >
              <SearchIcon />
              <span className="truncate">Buscar en Esencial</span>
            </button>
            <button
              type="button"
              aria-label={THEME_LABEL[theme]}
              onClick={cycleTheme}
              className="state grid size-12 shrink-0 place-items-center rounded-full text-on-surface-variant"
            >
              <ThemeIcon />
            </button>
          </div>

          {calendarRoute && navSection?.children ? (
            <nav
              aria-label={navSection.label}
              className={connectedClass("self-start")}
            >
              {navSection.children.map((child) => (
                <Link
                  key={child.href}
                  to={child.href}
                  className={connectedItemClass("min-h-12 px-5")}
                  onPointerDown={ripple}
                >
                  {child.label}
                </Link>
              ))}
            </nav>
          ) : null}

          {children}

          {calendarRoute ? (
            <div aria-hidden="true" className="hidden h-14 shrink-0 lg:block" />
          ) : null}
        </main>

        {/* Las pantallas con barra de herramientas flotante (sesión, editor de
            plantilla) o que ya son un formulario de crear no llevan FAB: se
            pisaría con la barra y su acción ya está en pantalla. */}
        {FLOATING_TOOLBAR.test(pathname) ? null : (
          <FabMenu extended={false} placement="float" />
        )}

        {/* Móvil: barra de navegación M3 (80 px + área segura). */}
        <nav
          aria-label="Secciones"
          className="fixed inset-x-0 bottom-0 z-20 bg-surface-container pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <div className="mx-auto flex h-20 max-w-lg items-stretch">
            {NAV.map((s) => {
              const active = sectionActive(pathname, s);
              return (
                <Link
                  key={s.key}
                  data-section={s.key}
                  to={s.href}
                  aria-current={isActive(pathname, s.href) ? "page" : undefined}
                  className={cx(
                    "flex flex-1 flex-col items-center justify-center gap-1",
                    active ? "text-on-surface" : "text-on-surface-variant",
                  )}
                  onPointerDown={ripple}
                >
                  <span
                    className={cx(
                      "state grid h-8 place-items-center rounded-full transition-[width,background-color] motion-spatial-fast",
                      active
                        ? "w-16 bg-accent-container text-on-accent-container"
                        : "w-8",
                    )}
                  >
                    <s.icon filled={active} />
                  </span>
                  <span
                    className={cx(
                      "type-move text-label-m",
                      active ? "font-extrabold" : "font-medium",
                    )}
                  >
                    {s.label}
                  </span>
                </Link>
              );
            })}
            <Link
              to="/ui"
              aria-current={isActive(pathname, "/ui") ? "page" : undefined}
              className={cx(
                "flex flex-1 flex-col items-center justify-center gap-1",
                isActive(pathname, "/ui")
                  ? "text-on-surface"
                  : "text-on-surface-variant",
              )}
            >
              <span
                className={cx(
                  "state grid h-8 place-items-center rounded-full transition-[width] motion-spatial-fast",
                  isActive(pathname, "/ui")
                    ? "w-16 bg-secondary-container"
                    : "w-8",
                )}
              >
                <SwatchIcon filled={isActive(pathname, "/ui")} />
              </span>
              <span className="text-label-m font-medium">UI</span>
            </Link>
            <button
              type="button"
              onClick={logout}
              className="flex flex-1 flex-col items-center justify-center gap-1 text-on-surface-variant"
            >
              <span className="state grid h-8 w-8 place-items-center rounded-full">
                <LogoutIcon />
              </span>
              <span className="text-label-m font-medium">Salir</span>
            </button>
          </div>
        </nav>

        {palette.open && (
          <CommandPalette
            onClose={palette.hide}
            onToggleTheme={cycleTheme}
            themeLabel={THEME_LABEL[theme]}
          />
        )}
      </div>
    </SnackbarHost>
  );
}
