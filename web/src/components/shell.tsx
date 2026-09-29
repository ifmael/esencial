// Armazón de la app (M3 Expressive):
// - Escritorio: raíl de navegación M3E con el menú FAB arriba y el indicador
//   activo en pastilla (cambia de forma y la etiqueta gana peso). El usuario lo
//   expande a cajón con submenús o lo pliega (raíl de 96 px con etiquetas en
//   todas las rutas).
// - Móvil: barra de navegación inferior M3 con área segura y FAB flotante.
// - Submenú de la sección en las rutas de calendario: grupo de botones
//   conectados sobre la rejilla.
// - Búsqueda ⌘K (search view M3), acceso a Ajustes (tema y catálogo) y snackbar global.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { apiFetchRaw } from "../lib/api";
import { toISODate } from "../lib/day";
import { pushEscape } from "../lib/escape-stack";
import { followSystem, readTheme } from "../lib/theme";
import { morphFrom } from "../lib/view-transition";
import { CommandPalette, useCommandPalette } from "./command-palette";
import {
  AddIcon,
  BookIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CloseIcon,
  DumbbellIcon,
  HomeIcon,
  LeafIcon,
  ListIcon,
  LogoutIcon,
  SearchIcon,
  SettingsIcon,
  UtensilsIcon,
} from "./icons";
import { Scrim, SnackbarHost } from "./overlay";
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
 * página se queda sin cabecera y ocupa la ventana entera. El submenú de la
 * sección va como grupo conectado sobre la rejilla; abajo, un hueco reservado
 * para acciones futuras. */
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
 * secondary). `/ajustes`, `/ui` y `/sesion` caen en la que les corresponde. */
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

/** Destino del raíl colapsado: icono en una pastilla de 56×32 que se
 * ensancha al activarse (cambio de forma) y etiqueta debajo que gana peso. */
function RailItem({
  href,
  label,
  icon: Icon,
  active,
  current,
}: {
  href: string;
  label: string;
  icon: IconType;
  active: boolean;
  current: boolean;
}) {
  return (
    <Link
      to={href}
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
      <span
        className={cx(
          "type-move text-label-m",
          active ? "font-extrabold" : "font-medium",
        )}
      >
        {label}
      </span>
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
  // El raíl tiene `overflow-y-auto` (y con él `overflow-x`), que recortaría un
  // menú `absolute` a sus 96 px: en el raíl el menú va `fixed`, bajo el FAB.
  const [anchor, setAnchor] = useState<{ top: number; left: number }>();
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
      to: `/sesion/${toISODate(new Date())}`,
    },
    { label: "Plantilla", icon: ListIcon, to: "/plantillas/nueva" },
    { label: "Receta", icon: BookIcon, to: "/recetario/nueva" },
  ];
  return (
    <>
      {/* Velo: separa el menú de la página que tapa, y pulsarlo lo cierra. */}
      {open ? <Scrim onClose={() => setOpen(false)} /> : null}
      <div
        // `relative` y `fixed` a la vez: gana el que Tailwind emita después
        // (relative), y el FAB flotante acababa al final del documento. Abierto
        // sube por encima del velo; cerrado, el flotante queda bajo los diálogos.
        className={cx(
          placement === "float"
            ? "fixed right-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:hidden"
            : "relative",
          open ? "z-50" : placement === "float" && "z-30",
        )}
      >
        <Fab
          aria-label={open ? "Cerrar menú de crear" : "Crear"}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setAnchor({ top: r.bottom + 8, left: r.left });
            setOpen((o) => !o);
          }}
          className={cx(extended && !open ? "px-5" : "w-14 px-0")}
        >
          {open ? <CloseIcon /> : <AddIcon />}
          {extended && !open ? (
            <span className="text-label-l">Crear</span>
          ) : null}
        </Fab>
        {open ? (
          <div
            role="menu"
            aria-label="Crear"
            style={placement === "rail" ? anchor : undefined}
            className={cx(
              "stagger flex flex-col gap-1",
              placement === "rail"
                ? "fixed items-start"
                : "absolute right-0 bottom-16 items-end",
            )}
          >
            {/* Menú FAB M3E: cada acción con el contenedor de la sección a la
                que lleva (Deporte o Nutrición), plana sobre el velo; el botón
                de cerrar contrasta con el tono fuerte. */}
            {items.map((item, i) => (
              <div key={item.label} style={{ ["--i" as string]: i }}>
                <button
                  type="button"
                  role="menuitem"
                  data-section={sectionOf(item.to)}
                  onClick={(e) => {
                    // Lo pulsado crece hasta el formulario (transición de vista).
                    morphFrom(e.currentTarget);
                    navigate(item.to, { viewTransition: true });
                  }}
                  onPointerDown={ripple}
                  className="state flex h-14 items-center gap-2 rounded-full bg-accent-container px-6 text-title-m whitespace-nowrap text-on-accent-container"
                >
                  <item.icon />
                  {item.label}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [menuPref, setMenuPref] = useState(readMenuPref);
  const calendarRoute = CALENDAR_ROUTES[pathname] === true;
  // Solo lo pliega el usuario: navegar nunca cambia el menú.
  const collapsed = menuPref === "collapsed";
  const navSection = NAV.find((section) => section.href === pathname);
  const palette = useCommandPalette();
  const section = sectionOf(pathname);

  useEffect(() => followSystem(readTheme), []);

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
                            ? "bg-accent-soft font-extrabold text-on-accent-soft"
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
            // `lg:z-10`: `sticky` abre un contexto de apilamiento; sin z-index el
            // `main` (posterior en el DOM) pinta encima del menú de crear.
            "hidden shrink-0 flex-col bg-surface py-5 lg:sticky lg:top-0 lg:z-10 lg:flex lg:h-dvh lg:overflow-y-auto transition-[width] motion-spatial",
            collapsed ? "w-24 items-center gap-6 px-2" : "w-72 gap-6 px-3",
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
                <button
                  type="button"
                  aria-label="Buscar (⌘K)"
                  title="Buscar (⌘K)"
                  onClick={palette.show}
                  className="state grid size-12 place-items-center rounded-full text-on-surface-variant"
                >
                  <SearchIcon />
                </button>
                <Link
                  to="/ajustes"
                  aria-label="Ajustes"
                  title="Ajustes"
                  aria-current={
                    isActive(pathname, "/ajustes") ? "page" : undefined
                  }
                  className="state grid size-12 place-items-center rounded-full text-on-surface-variant"
                >
                  <SettingsIcon filled={isActive(pathname, "/ajustes")} />
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
                <Link
                  to="/ajustes"
                  aria-current={
                    isActive(pathname, "/ajustes") ? "page" : undefined
                  }
                  className={drawerRow(isActive(pathname, "/ajustes"))}
                >
                  <SettingsIcon filled={isActive(pathname, "/ajustes")} />
                  Ajustes
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
              to="/ajustes"
              aria-current={isActive(pathname, "/ajustes") ? "page" : undefined}
              className={cx(
                "flex flex-1 flex-col items-center justify-center gap-1",
                isActive(pathname, "/ajustes")
                  ? "text-on-surface"
                  : "text-on-surface-variant",
              )}
            >
              <span
                className={cx(
                  "state grid h-8 place-items-center rounded-full transition-[width] motion-spatial-fast",
                  isActive(pathname, "/ajustes")
                    ? "w-16 bg-secondary-container"
                    : "w-8",
                )}
              >
                <SettingsIcon filled={isActive(pathname, "/ajustes")} />
              </span>
              <span className="text-label-m font-medium">Ajustes</span>
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

        {palette.open && <CommandPalette onClose={palette.hide} />}
      </div>
    </SnackbarHost>
  );
}
