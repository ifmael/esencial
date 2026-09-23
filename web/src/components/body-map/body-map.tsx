// Mapa muscular: 89 regiones anatómicas entre las dos vistas. Cada músculo
// pertenece a una sub-región (`MUSCLE_REGIONS`) y las dos mitades — izquierda y
// derecha — van en **un solo `<g role="button">`**, así que hay un botón por
// músculo, no por pieza dibujada. La anatomía de relleno (cabeza, manos, pies,
// articulaciones) se dibuja y no se pulsa.
//
// Los `path` son de `body-muscles` (Apache-2.0; `LICENSE` y `NOTICE` en esta
// carpeta). Los colores no son los del original, salen del sistema de diseño:
// músculo en reposo `--color-muscle`, bajo el ratón `--color-muscle-strong`,
// músculo elegido `--color-primary`, anatomía sin filtro `--color-border-strong`
// y el trazo que separa las piezas, el de la superficie.
import { BACK_REGIONS, type BodyRegion, FRONT_REGIONS } from "./data";
import { canonicalRegionId, MUSCLE_REGIONS, regionLabel } from "./regions";

export type BodyView = "front" | "back";

/** Caja de cada vista en el lienzo original: comparten espacio de coordenadas,
 *  el cuerpo trasero está desplazado (su contenido va de `x = 36,5` a `x = 68,6`). */
const VIEWBOX: Record<BodyView, string> = {
  front: "0 0 35 93",
  back: "36 0 37 93",
};

const VIEW_LABEL: Record<BodyView, string> = {
  front: "Vista frontal",
  back: "Vista trasera",
};

export function BodyMap({
  view,
  region,
  onSelect,
}: {
  view: BodyView;
  /** Sub-región elegida (`MUSCLE_REGIONS`), o `null` si no hay filtro. */
  region: string | null;
  onSelect: (region: string) => void;
}) {
  const regions = view === "front" ? FRONT_REGIONS : BACK_REGIONS;
  const layers = new Map<string, BodyRegion[]>();
  for (const r of regions) {
    if (!r.tag) continue;
    const id = canonicalRegionId(r.id);
    const list = layers.get(id);
    if (list) list.push(r);
    else layers.set(id, [r]);
  }

  return (
    <svg
      viewBox={VIEWBOX[view]}
      aria-label={VIEW_LABEL[view]}
      className="h-64 w-auto md:h-full"
    >
      {/* Relleno: cabeza, manos, pies y articulaciones. Se dibujan, no se pulsan. */}
      <g className="fill-border-strong">
        {regions
          .filter((r) => r.tag === null)
          .map((r) => (
            <Muscle key={r.id} region={r} />
          ))}
      </g>
      {MUSCLE_REGIONS.map(({ id }) => {
        const list = layers.get(id);
        if (!list) return null;
        const active = region === id;
        return (
          <g
            key={id}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            aria-label={regionLabel(id)}
            className={`cursor-pointer transition-colors duration-150 ease-out-quart ${
              active ? "fill-primary" : "fill-muscle hover:fill-muscle-strong"
            }`}
            onClick={() => onSelect(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(id);
              }
            }}
          >
            {list.map((r) => (
              <Muscle key={r.id} region={r} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** Un músculo: el trazo separa las piezas con el color de la superficie (1px
 *  real en cualquier tamaño) y el `title` lo nombra al pasar el ratón. */
function Muscle({ region }: { region: BodyRegion }) {
  return (
    <path
      d={region.path}
      stroke="var(--color-surface)"
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
    >
      <title>{region.label}</title>
    </path>
  );
}
