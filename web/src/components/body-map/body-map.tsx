// Mapa muscular: 89 regiones anatómicas entre las dos vistas. Cada músculo
// pertenece a una sub-región (`MUSCLE_REGIONS`) y las dos mitades — izquierda y
// derecha — van en **un solo `<g role="button">`**, así que hay un botón por
// músculo, no por pieza dibujada. La anatomía de relleno (cabeza, manos, pies,
// articulaciones) se dibuja y no se pulsa.
//
// Dos modos, según lleve `onSelect` o no: con él el dibujo **filtra** (selector
// de ejercicios) y sin él **informa** (ficha de un ejercicio), que es solo
// lectura: sin botones, sin foco y con su nombre accesible («Vista frontal:
// Pecho inferior…»). En ese modo una vista sin músculos del ejercicio no se
// dibuja: un cuerpo entero sin nada marcado se lee como un error.
//
// Los `path` son de `body-muscles` (Apache-2.0; `LICENSE` y `NOTICE` en esta
// carpeta). Los colores no son los del original, salen del sistema de diseño:
// el músculo en reposo va en `--color-muscle` —en el dibujo de solo lectura,
// en `--color-border-strong`, el gris de la anatomía de relleno, para que
// destaque solo lo que trabaja el ejercicio—, bajo el ratón en
// `--color-muscle-strong`, el músculo afectado o elegido en `--color-primary`,
// la anatomía sin filtro en `--color-border-strong` y el trazo que separa las
// piezas, el de la superficie.
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
  regions,
  onSelect,
  className = "h-64 w-auto md:h-full",
}: {
  view: BodyView;
  /** Sub-regiones resaltadas (`MUSCLE_REGIONS`): el filtro o lo que se marca. */
  regions: string[];
  /** Sin él, el dibujo es solo lectura: informa y no filtra. */
  onSelect?: (region: string) => void;
  className?: string;
}) {
  const shapes = view === "front" ? FRONT_REGIONS : BACK_REGIONS;
  const layers = new Map<string, BodyRegion[]>();
  for (const r of shapes) {
    if (!r.tag) continue;
    const id = canonicalRegionId(r.id);
    const list = layers.get(id);
    if (list) list.push(r);
    else layers.set(id, [r]);
  }

  const active = new Set(regions);
  // `MUSCLE_REGIONS` va en orden alfabético por nombre: el mismo para el filtro
  // y para el nombre accesible del dibujo.
  const highlighted = MUSCLE_REGIONS.filter(
    (m) => layers.has(m.id) && active.has(m.id),
  );
  if (!onSelect && highlighted.length === 0) return null;
  const name = `${VIEW_LABEL[view]}: ${highlighted.map((m) => m.label).join(", ")}`;

  return (
    <svg
      viewBox={VIEWBOX[view]}
      aria-label={onSelect ? VIEW_LABEL[view] : name}
      // Solo lectura: una imagen con nombre, no un lienzo de botones.
      role={onSelect ? undefined : "img"}
      className={className}
    >
      {/* Relleno: cabeza, manos, pies y articulaciones. Se dibujan, no se pulsan. */}
      <g className="fill-border-strong">
        {shapes
          .filter((r) => r.tag === null)
          .map((r) => (
            <Muscle key={r.id} region={r} />
          ))}
      </g>
      {MUSCLE_REGIONS.map(({ id }) => {
        const list = layers.get(id);
        if (!list) return null;
        const on = active.has(id);
        // Solo lectura: el cuerpo en gris (el mismo tono de la anatomía de
        // relleno) y solo en verde lo que trabaja el ejercicio, para que los
        // músculos afectados salten a la vista. En el selector manda el verde
        // de reposo, porque ahí lo que importa es el filtro elegido.
        const skin = on
          ? "fill-primary"
          : onSelect
            ? "fill-muscle"
            : "fill-border-strong";
        const pieces = list.map((r) => <Muscle key={r.id} region={r} />);
        if (!onSelect)
          return (
            <g key={id} className={skin}>
              {pieces}
            </g>
          );
        return (
          <g
            key={id}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={regionLabel(id)}
            className={`cursor-pointer transition-colors duration-150 ease-out-quart ${skin} ${
              on ? "" : "hover:fill-muscle-strong"
            }`}
            // El ratón no roba el foco: si lo robara, el navegador pintaría su
            // anillo de foco (un recuadro redondeado) sobre el músculo, que es
            // justo lo que no debe verse. La señal de "elegido" es el color, y
            // el teclado conserva su anillo al tabular.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(id);
              }
            }}
          >
            {pieces}
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
