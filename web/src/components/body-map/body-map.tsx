// Mapa muscular: 89 regiones anatómicas entre las dos vistas. Cada músculo
// pertenece a uno de los grupos de `GROUP_LABELS` (o es anatomía de relleno,
// sin filtro); las regiones de un grupo van en **un solo `<g role="button">`**,
// así que la rejilla de teclado no crece con el detalle del dibujo.
//
// Los `path` son de `body-muscles` (Apache-2.0; `LICENSE` y `NOTICE` en esta
// carpeta). Los colores no son los del original, salen del sistema de diseño:
// músculo en reposo `--color-muscle`, bajo el ratón `--color-muscle-strong`,
// grupo elegido `--color-primary`, anatomía sin filtro `--color-border-strong`
// y el trazo que separa las piezas, el de la superficie.
import { GROUP_LABELS } from "../grouped-exercises";
import { BACK_REGIONS, type BodyRegion, FRONT_REGIONS } from "./data";

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
  group,
  onSelect,
}: {
  view: BodyView;
  group: string | null;
  onSelect: (tag: string) => void;
}) {
  const regions = view === "front" ? FRONT_REGIONS : BACK_REGIONS;
  const layers: Record<string, BodyRegion[]> = {};
  for (const region of regions) {
    if (!region.tag) continue;
    layers[region.tag] ??= [];
    layers[region.tag].push(region);
  }

  return (
    <svg
      viewBox={VIEWBOX[view]}
      aria-label={VIEW_LABEL[view]}
      className="h-64 w-auto shrink-0 md:h-80"
    >
      {/* Relleno: cabeza, manos, pies y articulaciones. Se dibujan, no se pulsan. */}
      <g className="fill-border-strong">
        {regions
          .filter((r) => r.tag === null)
          .map((r) => (
            <Muscle key={r.id} region={r} />
          ))}
      </g>
      {Object.entries(layers).map(([tag, list]) => {
        const active = group === tag;
        return (
          <g
            key={tag}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            aria-label={GROUP_LABELS[tag] ?? tag}
            className={`cursor-pointer transition-colors duration-150 ease-out-quart ${
              active ? "fill-primary" : "fill-muscle hover:fill-muscle-strong"
            }`}
            onClick={() => onSelect(tag)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(tag);
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
