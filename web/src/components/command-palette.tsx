// Paleta de comandos (⌘K / Ctrl+K): saltar a una pantalla, buscar receta o
// ejercicio por nombre y acciones rápidas. Patrón ARIA «combobox con listbox»
// dentro de un diálogo modal: el foco se queda en el campo (la opción activa se
// anuncia con `aria-activedescendant`), Tab no sale y al cerrar vuelve a quien
// la abrió. Recetas y ejercicios se piden la primera vez que se abre.
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
import { apiGet } from "../lib/api";
import {
  type Command,
  type CommandGroup,
  moveActive,
  rankCommands,
} from "../lib/command-palette";
import { toISODate } from "../lib/day";
import { SearchIcon } from "./icons";
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
    href: "#tema",
    keywords: ["modo oscuro", "claro", "apariencia"],
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
    id: "p-ui",
    group: "Pantallas",
    label: "Sistema de diseño",
    href: "/ui",
    keywords: ["catálogo", "componentes"],
  },
];

type Named = { id: number; name: string };

/** Recetas y ejercicios como comandos de búsqueda. Se piden al abrir la paleta
 * (el componente solo existe abierto), así que nunca están viejos. */
function useSearchables(): Command[] {
  const [items, setItems] = useState<Command[]>([]);
  useEffect(() => {
    let alive = true;
    const as = (group: CommandGroup, base: string) => (list: Named[]) =>
      list.map<Command>((x) => ({
        id: `${group}-${x.id}`,
        group,
        label: x.name,
        href: `${base}/${x.id}`,
        searchOnly: true,
      }));
    Promise.all([
      apiGet<Named[]>("/api/recipes").then(
        as("Recetas", "/recetario"),
        () => [],
      ),
      apiGet<Named[]>("/api/exercises").then(
        as("Ejercicios", "/ejercicios"),
        () => [],
      ),
    ]).then(([r, e]) => alive && setItems([...r, ...e]));
    return () => {
      alive = false;
    };
  }, []);
  return items;
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  const returnTo = useRef<HTMLElement | null>(null);

  // Quién tenía el foco se recuerda ANTES de abrir (el campo se enfoca al
  // montar) y fuera del updater de `setOpen`, que debe ser puro (StrictMode lo
  // ejecuta dos veces). Al cerrar —Escape, ⌘K otra vez o al elegir— el foco
  // vuelve una sola vez y la referencia se suelta.
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

export function CommandPalette({
  onClose,
  onToggleTheme,
}: {
  onClose: () => void;
  onToggleTheme: () => void;
}) {
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
  const current = results[active] ?? null;
  const optionId = (c: Command) => `${listId}-${c.id}`;

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    document
      .getElementById(current ? `${listId}-${current.id}` : "")
      ?.scrollIntoView?.({ block: "nearest" });
  }, [current, listId]);

  const run = (c: Command) => {
    onClose();
    if (c.href === "#tema") onToggleTheme();
    else navigate(c.href.replace(":hoy", toISODate(new Date())));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step !== undefined) {
      e.preventDefault();
      setActive((i) => moveActive(i, step, results.length));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : results.length - 1);
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

  // Encabezado de grupo solo cuando cambia respecto a la fila anterior.
  let lastGroup: CommandGroup | null = null;

  return (
    <div
      className="scrim fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 md:pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-pop flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-raised"
      >
        <h2 id={titleId} className="sr-only">
          Paleta de comandos
        </h2>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <SearchIcon
            width={18}
            height={18}
            className="shrink-0 text-text-secondary"
          />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current ? optionId(current) : undefined}
            aria-label="Buscar pantallas, recetas o ejercicios"
            placeholder="Busca una pantalla, receta o ejercicio…"
            className="h-12 min-w-0 flex-1 bg-transparent text-lead outline-none placeholder:text-text-secondary"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <Kbd>esc</Kbd>
        </div>

        <ul
          id={listId}
          role="listbox"
          aria-label="Resultados"
          className="min-h-0 flex-1 overflow-y-auto p-2"
        >
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const selected = i === active;
            return (
              <li key={c.id} role="presentation">
                {header && (
                  <div
                    aria-hidden="true"
                    className="section-label px-2 pt-2 pb-1"
                  >
                    {header}
                  </div>
                )}
                <div
                  id={optionId(c)}
                  role="option"
                  aria-selected={selected}
                  // El ratón no roba el foco del campo.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(c)}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 text-body transition-colors duration-100 ${
                    selected
                      ? "bg-surface-muted text-text"
                      : "text-text-secondary"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {selected && (
                    <span className="font-mono text-micro text-text-secondary">
                      ↵
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {results.length === 0 && (
          <p
            role="status"
            className="px-4 pb-6 pt-2 text-center text-body text-text-secondary"
          >
            Sin resultados para «{query}»
          </p>
        )}

        <footer className="flex items-center gap-4 border-t border-border bg-surface-muted px-4 py-2 text-caption text-text-secondary">
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
