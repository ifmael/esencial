// Búsqueda ⌘K / Ctrl+K con piel de *search view* M3: en escritorio un panel
// que se despliega desde arriba; en móvil a pantalla completa. Patrón ARIA
// «combobox con listbox» en un diálogo modal: el foco se queda en el campo (la
// opción activa va por `aria-activedescendant`), Tab no sale y al cerrar vuelve
// a quien la abrió. Recetas, ejercicios y plantillas se piden al abrir.
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { apiGet, apiGetCached } from "../lib/api";
import {
  type Command,
  type CommandGroup,
  groupResults,
  moveActive,
  rankCommands,
} from "../lib/command-palette";
import { toISODate } from "../lib/day";
import { applyTheme, nextTheme, THEME_NAME, useTheme } from "../lib/theme";
import {
  AddIcon,
  BackIcon,
  BookIcon,
  ContrastIcon,
  DumbbellIcon,
  ListIcon,
  SearchIcon,
  SwatchIcon,
  UtensilsIcon,
} from "./icons";
import { Kbd } from "./ui";

const STATIC: Command[] = [
  { id: "a-hoy", group: "Acciones", label: "Ir a hoy", href: "/" },
  {
    id: "a-receta",
    group: "Acciones",
    label: "Nueva receta",
    href: "/recetario/nueva",
    keywords: ["crear receta", "añadir receta"],
  },
  {
    id: "a-plantilla",
    group: "Acciones",
    label: "Nueva plantilla",
    href: "/plantillas/nueva",
    keywords: ["crear plantilla", "rutina"],
  },
  {
    id: "a-sesion",
    group: "Acciones",
    label: "Registrar la sesión de hoy",
    href: "/sesion/:hoy",
    keywords: ["entrenar", "workout", "series"],
  },
  {
    id: "a-tema",
    group: "Acciones",
    label: "Cambiar tema",
    action: "theme",
    keywords: ["modo oscuro", "claro", "apariencia", "sistema"],
  },
  {
    id: "p-fuerza",
    group: "Pantallas",
    label: "Plan de fuerza",
    href: "/plan-fuerza",
    keywords: ["deporte", "semana", "calendario", "gimnasio"],
  },
  {
    id: "p-comidas",
    group: "Pantallas",
    label: "Plan de comidas",
    href: "/plan-recetas",
    keywords: ["nutrición", "menú", "semana", "compra"],
  },
  {
    id: "p-recetario",
    group: "Pantallas",
    label: "Recetario",
    href: "/recetario",
  },
  {
    id: "p-ejercicios",
    group: "Pantallas",
    label: "Ejercicios",
    href: "/ejercicios",
  },
  {
    id: "p-plantillas",
    group: "Pantallas",
    label: "Plantillas",
    href: "/plantillas",
  },
  {
    id: "p-ajustes",
    group: "Pantallas",
    label: "Ajustes",
    href: "/ajustes",
    keywords: ["configuración", "preferencias"],
  },
  {
    id: "p-ui",
    group: "Pantallas",
    label: "Sistema de diseño",
    href: "/ui",
    keywords: ["catálogo", "componentes"],
  },
];

const GROUP_ICON: Record<CommandGroup, typeof SearchIcon> = {
  Acciones: AddIcon,
  Pantallas: SwatchIcon,
  Recetas: BookIcon,
  Ejercicios: DumbbellIcon,
  Plantillas: ListIcon,
};

type Named = { id: number; name: string };

/** Recetas, ejercicios y plantillas como comandos de búsqueda. */
function useSearchables(): Command[] {
  const [items, setItems] = useState<Command[]>([]);
  useEffect(() => {
    let alive = true;
    const as =
      (group: CommandGroup, href: (id: number) => string) => (list: Named[]) =>
        list.map<Command>((x) => ({
          id: `${group}-${x.id}`,
          group,
          label: x.name,
          href: href(x.id),
          searchOnly: true,
        }));
    Promise.all([
      apiGetCached<Named[]>("/api/recipes").then(
        as("Recetas", (id) => `/recetario/${id}`),
        () => [],
      ),
      apiGetCached<Named[]>("/api/exercises").then(
        as("Ejercicios", (id) => `/ejercicios/${id}`),
        () => [],
      ),
      apiGet<Named[]>("/api/templates").then(
        as("Plantillas", (id) => `/plantillas/${id}/editar`),
        () => [],
      ),
    ]).then((lists) => alive && setItems(lists.flat()));
    return () => {
      alive = false;
    };
  }, []);
  return items;
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  const returnTo = useRef<HTMLElement | null>(null);
  // Quién tenía el foco se recuerda ANTES de abrir y fuera del updater de
  // `setOpen` (StrictMode lo ejecuta dos veces). Al cerrar el foco vuelve una
  // sola vez y la referencia se suelta.
  const openRef = useRef(false);
  const toggle = useCallback((next?: boolean) => {
    const now = next ?? !openRef.current;
    if (now && !openRef.current)
      returnTo.current = document.activeElement as HTMLElement | null;
    openRef.current = now;
    setOpen(now);
  }, []);
  useEffect(() => {
    if (open || !returnTo.current) return;
    returnTo.current.focus();
    returnTo.current = null;
  }, [open]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return {
    open,
    show: useCallback(() => toggle(true), [toggle]),
    hide: useCallback(() => toggle(false), [toggle]),
  };
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const titleId = useId();
  const searchables = useSearchables();

  const results = useMemo(
    () => rankCommands([...STATIC, ...searchables], query, 40),
    [searchables, query],
  );
  const sections = useMemo(() => groupResults(results), [results]);
  const ordered = sections.flatMap((s) => s.items.map((i) => i.command));
  const current = ordered[active] ?? null;
  const optionId = (c: Command) => `${listId}-${c.id}`;

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    document
      .getElementById(current ? `${listId}-${current.id}` : "")
      ?.scrollIntoView?.({ block: "nearest" });
  }, [current, listId]);

  const run = (c: Command) => {
    onClose();
    if (c.action === "theme") applyTheme(nextTheme(theme));
    else navigate(c.href.replace(":hoy", toISODate(new Date())));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step !== undefined) {
      e.preventDefault();
      setActive((i) => moveActive(i, step, ordered.length));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : ordered.length - 1);
    } else if (e.key === "Enter" && current) {
      e.preventDefault();
      run(current);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      // El único control enfocable es el campo: Tab no sale del diálogo.
      e.preventDefault();
    }
  };

  const empty = ordered.length === 0;

  return (
    <div
      className="scrim fixed inset-0 z-[70] flex items-stretch justify-center md:items-start md:p-4 md:pt-16"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="search-view flex w-full flex-col overflow-hidden md:max-h-[72vh] md:max-w-2xl md:rounded-xl"
      >
        <h2 id={titleId} className="sr-only">
          Buscar: pantallas, recetas, ejercicios y plantillas
        </h2>
        {/* Barra de búsqueda M3: 56 px, esquina completa, icono delante. */}
        <div className="flex h-18 shrink-0 items-center gap-2 border-b border-outline-variant px-2 md:h-16 md:px-4">
          <button
            type="button"
            aria-label="Cerrar búsqueda"
            onClick={onClose}
            className="state grid size-12 place-items-center rounded-full text-on-surface-variant md:hidden"
          >
            <BackIcon />
          </button>
          <SearchIcon className="hidden shrink-0 text-on-surface-variant md:block" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current ? optionId(current) : undefined}
            aria-label="Buscar pantallas, recetas, ejercicios o plantillas"
            placeholder="Busca una receta, ejercicio o pantalla…"
            className="h-12 min-w-0 flex-1 bg-transparent text-body-l outline-none placeholder:text-on-surface-variant"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <Kbd className="hidden md:inline-grid">esc</Kbd>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Resultados"
          className="min-h-0 flex-1 overflow-y-auto p-2"
        >
          {sections.map((s) => {
            const headerId = `${listId}-g-${s.group}`;
            const Icon = GROUP_ICON[s.group];
            return (
              <div
                key={s.group}
                role="group"
                aria-labelledby={headerId}
                className="pb-2"
              >
                <div id={headerId} className="section-label px-4 pt-3 pb-2">
                  {s.group}
                </div>
                {s.items.map(({ command: c, index }) => {
                  const selected = index === active;
                  return (
                    <div
                      key={c.id}
                      id={optionId(c)}
                      role="option"
                      aria-selected={selected}
                      // El ratón no roba el foco del campo.
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => setActive(index)}
                      onClick={() => run(c)}
                      className={`flex min-h-12 cursor-pointer items-center gap-4 rounded-full px-4 text-body-l motion-effects-fast transition-colors ${
                        selected
                          ? "bg-secondary-container text-on-secondary-container"
                          : "text-on-surface"
                      }`}
                    >
                      {c.action === "theme" ? (
                        <ContrastIcon className="shrink-0 text-on-surface-variant" />
                      ) : c.group === "Recetas" ? (
                        <UtensilsIcon className="shrink-0 text-tertiary" />
                      ) : (
                        <Icon className="shrink-0 text-on-surface-variant" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {c.label}
                        {c.action === "theme" ? (
                          <span className="text-on-surface-variant">
                            {" "}
                            · {THEME_NAME[theme]}
                          </span>
                        ) : null}
                      </span>
                      {selected ? <Kbd aria-hidden="true">↵</Kbd> : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {/* Vivo desde que se monta: el lector anuncia el cambio a «Sin
            resultados» en cuanto ocurre (un nodo que nace ya con texto no se
            anuncia en todos los lectores). */}
        <p
          role="status"
          className={
            empty
              ? "px-4 pb-8 pt-2 text-center text-body-l text-on-surface-variant"
              : "sr-only"
          }
        >
          {empty
            ? `Sin resultados para «${query}»`
            : `${ordered.length} resultados`}
        </p>

        <footer className="hidden items-center gap-4 border-t border-outline-variant px-4 py-2 text-body-s text-on-surface-variant md:flex">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> moverse
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> abrir
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </footer>
      </div>
    </div>
  );
}
