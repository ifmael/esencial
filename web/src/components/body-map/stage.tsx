// Escenario del mapa muscular: conmutador 2D/3D sobre el SVG.
//
// El SVG (`BodyMap`, que llega como `children`) es SIEMPRE la capa accesible:
// sus `<g role="button">` siguen en el DOM y en el orden de tabulación también
// en 3D, y es él quien da el tamaño a la caja. En 3D se vuelve transparente y
// sin puntero, y encima se pinta la escena WebGL, que se carga bajo demanda
// (`import()`): three y React Three Fiber no entran en el bundle inicial.
//
// La selección no vive aquí: las dos capas leen el mismo `regions` y llaman al
// mismo `onSelect`. Lo único propio del escenario es el músculo con foco de
// teclado, que en 3D se ilumina porque el anillo de foco del SVG no se ve.
//
// El 3D solo se ofrece con WebGL y sin `prefers-reduced-motion`.
import {
  type FocusEvent,
  lazy,
  type ReactNode,
  Suspense,
  useState,
} from "react";
import type { BodyView } from "./body-map";

const BodyMap3D = lazy(() => import("./body-map-3d"));

const STORAGE_KEY = "esencial.body-map.mode";
type Mode = "2d" | "3d";

function supports3D(): boolean {
  if (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function storedMode(): Mode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

function storeMode(mode: Mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* sin almacenamiento: la elección dura lo que la pantalla */
  }
}

export function BodyMapStage({
  view,
  regions,
  onSelect,
  className = "md:h-full",
  children,
}: {
  /** Vista que se mira; sin ella (ficha) la figura gira sola, despacio. */
  view?: BodyView;
  regions: string[];
  onSelect?: (region: string) => void;
  className?: string;
  /** El dibujo SVG accesible (uno o los dos `BodyMap`). */
  children: ReactNode;
}) {
  const [available] = useState(supports3D);
  const [mode, setMode] = useState<Mode>(() =>
    available ? storedMode() : "2d",
  );
  const [focused, setFocused] = useState<string | null>(null);
  const on3D = available && mode === "3d";

  const trackFocus = (e: FocusEvent) => {
    const g = (e.target as Element).closest?.("[data-region]");
    setFocused(g?.getAttribute("data-region") ?? null);
  };

  return (
    <div className={`flex min-h-0 flex-col items-center gap-2 ${className}`}>
      {available && (
        <fieldset className="flex gap-1">
          <legend className="sr-only">Modo del mapa</legend>
          {(["2d", "3d"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                storeMode(m);
              }}
              className={`min-h-11 min-w-11 rounded-chip px-3 font-numeric text-caption font-bold tracking-wide transition-colors duration-150 ease-out-quart ${
                mode === m
                  ? "bg-primary text-on-primary"
                  : "bg-surface-muted text-text-secondary hover:text-text"
              }`}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </fieldset>
      )}
      <div
        className={`relative flex min-h-0 flex-1 justify-center gap-4 ${on3D ? "min-w-56" : ""}`}
        onFocus={trackFocus}
        onBlur={() => setFocused(null)}
      >
        <div
          className={`contents ${on3D ? "[&>svg]:pointer-events-none [&>svg]:opacity-0" : ""}`}
        >
          {children}
        </div>
        {on3D && (
          <div className="absolute inset-0 overflow-hidden rounded-card">
            <Suspense
              fallback={
                <div
                  role="status"
                  className="skeleton grid h-full place-items-center text-caption text-text-secondary"
                >
                  Cargando 3D…
                </div>
              }
            >
              <BodyMap3D
                view={view}
                regions={regions}
                focused={focused}
                onSelect={onSelect}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
